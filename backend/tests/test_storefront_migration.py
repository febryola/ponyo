"""Run revision 0015 against disposable SQLite databases, never the app engine."""

import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models import Base


NEW_TABLES = {
    "product_categories", "brands", "suppliers", "product_images",
    "supplier_offers", "supplier_inventory", "shopping_carts", "cart_items",
    "order_status_history",
}
NEW_COLUMNS = {
    "products": {"category_id", "brand_id"},
    "order_items": {"supplier_offer_id"},
}
NOW = datetime.now(timezone.utc)


def _expected_storefront_metadata() -> sa.MetaData:
    """Revision 0015 creates inventory before revision 0017's sync timestamp."""
    metadata = sa.MetaData()
    for table in Base.metadata.tables.values():
        table.to_metadata(metadata)
    inventory = metadata.tables["supplier_inventory"]
    inventory._columns.remove(inventory.c.last_synced_at)
    return metadata


def _legacy_metadata() -> sa.MetaData:
    """Copy the model schema, then undo only the additive 0015 changes."""
    metadata = sa.MetaData()
    for table in Base.metadata.tables.values():
        if table.name not in NEW_TABLES:
            table.to_metadata(metadata)
    for name, removed in NEW_COLUMNS.items():
        table = metadata.tables[name]
        for index in list(table.indexes):
            if removed.intersection(index.columns.keys()):
                table.indexes.remove(index)
        for constraint in list(table.constraints):
            if removed.intersection(constraint.columns.keys()):
                table.constraints.remove(constraint)
                if isinstance(constraint, sa.ForeignKeyConstraint):
                    table.foreign_keys.difference_update(constraint.elements)
        for column in removed:
            # SQLAlchemy exposes no public API for removing a copied column.
            # Mutate only this detached copy, never the ORM's metadata.
            table._columns.remove(table.c[column])
    assert set(metadata.tables) == set(Base.metadata.tables) - NEW_TABLES
    for name, removed in NEW_COLUMNS.items():
        assert not removed.intersection(metadata.tables[name].c.keys())
        assert removed.issubset(Base.metadata.tables[name].c.keys())
    return metadata


def _rows(connection, metadata):
    return {
        name: [dict(row) for row in connection.execute(sa.select(table)).mappings()]
        for name, table in metadata.tables.items()
    }


@pytest.fixture
def legacy_database(tmp_path: Path, monkeypatch):
    path = (
        Path(__file__).resolve().parents[1]
        / "migrations" / "versions" / "20261111_0015_storefront_relations.py"
    )
    spec = importlib.util.spec_from_file_location("storefront_revision", path)
    assert spec is not None and spec.loader is not None
    revision = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(revision)
    assert revision.revision == "20261111_0015"
    assert revision.down_revision == "20261111_0014"

    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "storefront.sqlite")))
    reflect_foreign_keys = engine.dialect.get_foreign_keys

    def sqlite_foreign_keys(connection, table_name, schema=None, **options):
        # SQLAlchemy's SQLite CREATE TABLE parser misses ON DELETE on inline
        # references added with ALTER TABLE. Recover the actual database actions
        # from PRAGMA, not the expected models, so autogenerate still detects
        # genuinely missing/incorrect constraints and delete actions.
        foreign_keys = reflect_foreign_keys(connection, table_name, schema=schema, **options)
        quote = connection.dialect.identifier_preparer.quote_identifier
        prefix = f"{quote(schema)}." if schema else ""
        rows = connection.exec_driver_sql(
            f"PRAGMA {prefix}foreign_key_list({quote(table_name)})"
        ).mappings().all()
        for foreign_key in foreign_keys:
            matching = sorted((row for row in rows
                               if row["table"] == foreign_key["referred_table"]
                               and row["from"] in foreign_key["constrained_columns"]),
                              key=lambda row: row["seq"])
            assert [row["from"] for row in matching] == foreign_key["constrained_columns"]
            assert [row["to"] for row in matching] == foreign_key["referred_columns"]
            for action in ("on_delete", "on_update"):
                value = matching[0][action]
                if value != "NO ACTION":
                    foreign_key["options"][action.replace("_", "")] = value
        return foreign_keys

    # Scope the reflection workaround to this disposable engine only.
    monkeypatch.setattr(engine.dialect, "get_foreign_keys", sqlite_foreign_keys)
    metadata = _legacy_metadata()
    ids = {name: uuid4().hex for name in (
        "product", "variant", "other_variant", "customer", "order", "item",
        "category", "brand", "supplier", "offer", "inventory", "image",
        "cart", "guest_cart", "cart_item", "history",
    )}
    try:
        with engine.connect() as connection:
            # Set this before starting DML: SQLite ignores a PRAGMA toggle inside
            # an active DBAPI transaction. Never turn enforcement off for DDL.
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            metadata.create_all(connection)
            tables = metadata.tables
            connection.execute(tables["customers"].insert().values(
                id=UUID(ids["customer"]), email="legacy@example.com",
                password_hash="not-a-real-password", email_verified=True,
            ))
            connection.execute(tables["products"].insert().values(
                id=UUID(ids["product"]), slug="legacy-product", name="Legacy product",
                price_amount=1500, image_url="/legacy.jpg", published=True,
            ))
            for key in ("variant", "other_variant"):
                connection.execute(tables["product_variants"].insert().values(
                    id=UUID(ids[key]), product_id=UUID(ids["product"]), price_amount=1500,
                ))
            connection.execute(tables["orders"].insert().values(
                id=UUID(ids["order"]), order_number="PNY-LEGACY",
                customer_id=UUID(ids["customer"]), customer_email="legacy@example.com",
                total_amount=3000, shipping_address={"city": "Tokyo"},
                shipping_method="standard", payment_method="card",
            ))
            connection.execute(tables["order_items"].insert().values(
                id=UUID(ids["item"]), order_id=UUID(ids["order"]),
                variant_id=UUID(ids["variant"]), product_name="Legacy product",
                image_url="/legacy.jpg", quantity=2, unit_price=1500,
            ))
            connection.commit()
            yield connection, metadata, revision, ids
    finally:
        engine.dispose()


@pytest.fixture
def upgraded_database(legacy_database):
    connection, legacy, revision, ids = legacy_database
    before = _rows(connection, legacy)
    assert {name: len(before[name]) for name in (
        "products", "product_variants", "customers", "orders", "order_items",
    )} == {"products": 1, "product_variants": 2, "customers": 1, "orders": 1, "order_items": 1}
    with Operations.context(MigrationContext.configure(connection)):
        revision.upgrade()
    assert _rows(connection, legacy) == before
    assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    metadata = sa.MetaData()
    metadata.reflect(connection)
    tables = metadata.tables

    def insert(table_name, **values):
        connection.execute(tables[table_name].insert().values(**values))

    # Reflected UUIDs are SQLite CHAR(32), so bind hex strings, not UUID objects.
    # Omit defaults deliberately: Core reflection has no ORM Python defaults.
    insert("product_categories", id=ids["category"], slug="plush", name="Plush")
    insert("brands", id=ids["brand"], slug="ponyo", name="Ponyo")
    insert("suppliers", id=ids["supplier"], code="SUP-1", name="Supplier")
    insert("product_images", id=ids["image"], product_id=ids["product"], url="/new.jpg")
    insert("supplier_offers", id=ids["offer"], supplier_id=ids["supplier"],
           variant_id=ids["variant"], supplier_sku="SUP-SKU", cost_amount=500, currency="JPY")
    insert("supplier_inventory", id=ids["inventory"], offer_id=ids["offer"], updated_at=NOW)
    insert("shopping_carts", id=ids["cart"], customer_id=ids["customer"],
           created_at=NOW, updated_at=NOW)
    insert("shopping_carts", id=ids["guest_cart"], guest_token_hash="a" * 64,
           created_at=NOW, updated_at=NOW)
    insert("cart_items", id=ids["cart_item"], cart_id=ids["cart"],
           variant_id=ids["variant"], quantity=1, created_at=NOW, updated_at=NOW)
    insert("order_status_history", id=ids["history"], order_id=ids["order"],
           to_status="pending_payment", payment_status="unpaid",
           fulfillment_status="unfulfilled", source="migration-test",
           event_key="created", created_at=NOW)
    connection.execute(tables["products"].update().values(
        category_id=ids["category"], brand_id=ids["brand"],
    ))
    connection.execute(tables["order_items"].update().values(supplier_offer_id=ids["offer"]))
    connection.commit()
    return connection, tables, ids, before


def test_storefront_upgrade_matches_models_and_downgrade_preserves_legacy_rows(
    legacy_database, upgraded_database,
):
    connection, legacy, revision, _ = legacy_database
    _, tables, _, before = upgraded_database
    assert set(sa.inspect(connection).get_table_names()) == set(Base.metadata.tables)
    context = MigrationContext.configure(connection, opts={
        "compare_type": True,
        # SQLite reflects Boolean defaults as 1/0, whereas the ORM declares
        # quoted true/false strings. Test actual default values separately.
        "compare_server_default": False,
    })
    assert compare_metadata(context, _expected_storefront_metadata()) == []
    for name, columns in NEW_COLUMNS.items():
        for column in columns:
            assert tables[name].c[column].nullable is True
    assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


def test_storefront_downgrade_preserves_populated_legacy_schema(
    legacy_database, upgraded_database,
):
    connection, legacy, revision, _ = legacy_database
    _, _, _, before = upgraded_database
    with Operations.context(MigrationContext.configure(connection)):
        revision.downgrade()
    inspector = sa.inspect(connection)
    assert set(inspector.get_table_names()) == set(legacy.tables)
    for name, columns in NEW_COLUMNS.items():
        assert not columns.intersection(col["name"] for col in inspector.get_columns(name))
    assert _rows(connection, legacy) == before
    assert compare_metadata(MigrationContext.configure(connection, opts={
        "compare_type": True, "compare_server_default": False,
    }), legacy) == []
    assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    # A second upgrade catches stale indexes/constraints left by downgrade.
    with Operations.context(MigrationContext.configure(connection)):
        revision.upgrade()
    assert compare_metadata(MigrationContext.configure(connection, opts={
        "compare_type": True, "compare_server_default": False,
    }), _expected_storefront_metadata()) == []
    assert _rows(connection, legacy) == before


def test_storefront_foreign_keys_indexes_checks_and_uniques(upgraded_database):
    connection, _, _, _ = upgraded_database
    inspector = sa.inspect(connection)
    expected_foreign_keys = {
        "product_categories": {("parent_id", "product_categories", "SET NULL")},
        "brands": set(), "suppliers": set(),
        "product_images": {("product_id", "products", "CASCADE")},
        "supplier_offers": {("supplier_id", "suppliers", "RESTRICT"),
                            ("variant_id", "product_variants", "CASCADE")},
        "supplier_inventory": {("offer_id", "supplier_offers", "CASCADE")},
        "shopping_carts": {("customer_id", "customers", "CASCADE")},
        "cart_items": {("cart_id", "shopping_carts", "CASCADE"),
                       ("variant_id", "product_variants", "RESTRICT")},
        "order_status_history": {("order_id", "orders", "CASCADE")},
        "products": {("category_id", "product_categories", "SET NULL"),
                     ("brand_id", "brands", "SET NULL")},
        "order_items": {("order_id", "orders", "CASCADE"),
                        ("variant_id", "product_variants", None),
                        ("supplier_offer_id", "supplier_offers", "RESTRICT")},
    }
    for name, expected in expected_foreign_keys.items():
        foreign_keys = inspector.get_foreign_keys(name)
        assert {
            (fk["constrained_columns"][0], fk["referred_table"], fk["options"].get("ondelete"))
            for fk in foreign_keys
        } == expected, name
        assert all(fk["referred_columns"] == ["id"] for fk in foreign_keys)

    indexed_columns = {
        "product_images": {"product_id"},
        "supplier_offers": {"supplier_id", "variant_id"},
        "cart_items": {"cart_id", "variant_id"},
        "order_status_history": {"order_id"},
        **NEW_COLUMNS,
    }
    for name in NEW_TABLES | NEW_COLUMNS.keys():
        indexes = {index["name"]: (index["column_names"], bool(index["unique"]))
                   for index in inspector.get_indexes(name)}
        expected = {f"ix_{name}_{column}": ([column], False)
                    for column in indexed_columns.get(name, set())}
        if name in NEW_TABLES:
            assert indexes == expected, name
            assert inspector.get_pk_constraint(name)["constrained_columns"] == ["id"]
        else:
            assert expected.items() <= indexes.items(), name

    uniques = {
        "product_categories": {("slug",)}, "brands": {("slug",)},
        "suppliers": {("code",)}, "product_images": {("product_id", "sort_order")},
        "supplier_offers": {("supplier_id", "variant_id"), ("supplier_id", "supplier_sku")},
        "supplier_inventory": {("offer_id",)},
        "shopping_carts": {("customer_id",), ("guest_token_hash",)},
        "cart_items": {("cart_id", "variant_id")},
        "order_status_history": {("order_id", "event_key")},
    }
    checks = {
        "product_images": {"ck_product_images_position": "sort_order >= 0"},
        "supplier_offers": {
            "ck_supplier_offers_cost": "cost_amount >= 0",
            "ck_supplier_offers_minimum": "minimum_order_quantity > 0",
            "ck_supplier_offers_lead_time": "lead_time_days >= 0",
        },
        "supplier_inventory": {
            "ck_supplier_inventory_on_hand": "on_hand >= 0",
            "ck_supplier_inventory_reserved": "reserved >= 0 AND reserved <= on_hand",
        },
        "shopping_carts": {"ck_shopping_carts_owner":
            "(customer_id IS NOT NULL AND guest_token_hash IS NULL) OR "
            "(customer_id IS NULL AND guest_token_hash IS NOT NULL)"},
        "cart_items": {"ck_cart_items_quantity": "quantity > 0"},
    }
    for name in NEW_TABLES:
        assert {tuple(item["column_names"]) for item in inspector.get_unique_constraints(name)} == uniques[name]
        assert {item["name"]: " ".join(item["sqltext"].split())
                for item in inspector.get_check_constraints(name)} == checks.get(name, {})


@pytest.mark.parametrize("table,column,expected", [
    ("product_categories", "active", True), ("brands", "is_demo", False),
    ("suppliers", "is_demo", False), ("suppliers", "active", True),
    ("supplier_offers", "active", True),
    ("supplier_offers", "minimum_order_quantity", 1),
    ("supplier_offers", "lead_time_days", 3),
    ("supplier_inventory", "on_hand", 0), ("supplier_inventory", "reserved", 0),
    ("product_images", "alt", ""), ("product_images", "sort_order", 0),
    ("shopping_carts", "currency", "JPY"),
])
def test_storefront_server_defaults(upgraded_database, table, column, expected):
    connection, tables, _, _ = upgraded_database
    values = connection.scalars(sa.select(tables[table].c[column])).all()
    assert values and all(value == expected for value in values)
    if isinstance(expected, bool):
        assert all(value is expected for value in values)
        # Numeric SQLite defaults must not silently become truthy text 'false'.
        assert connection.exec_driver_sql(
            f"SELECT DISTINCT {column}, typeof({column}) FROM {table}"
        ).all() == [(int(expected), "integer")]


@pytest.mark.parametrize("table,column", [
    ("product_categories", "parent_id"), ("products", "category_id"),
    ("products", "brand_id"), ("order_items", "supplier_offer_id"),
    ("product_images", "product_id"), ("supplier_offers", "supplier_id"),
    ("supplier_offers", "variant_id"), ("supplier_inventory", "offer_id"),
    ("shopping_carts", "customer_id"), ("cart_items", "cart_id"),
    ("cart_items", "variant_id"), ("order_status_history", "order_id"),
])
def test_storefront_rejects_orphan_references(upgraded_database, table, column):
    connection, tables, ids, _ = upgraded_database
    statement = tables[table].update().values({column: uuid4().hex})
    if table == "shopping_carts":
        statement = statement.where(tables[table].c.id == ids["cart"])
    with pytest.raises(sa.exc.IntegrityError, match="FOREIGN KEY constraint failed"):
        with connection.begin_nested():
            connection.execute(statement)
    assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []


@pytest.mark.parametrize("table,values,check", [
    ("product_images", {"sort_order": -1}, "ck_product_images_position"),
    ("supplier_offers", {"cost_amount": -1}, "ck_supplier_offers_cost"),
    ("supplier_offers", {"minimum_order_quantity": 0}, "ck_supplier_offers_minimum"),
    ("supplier_offers", {"minimum_order_quantity": -1}, "ck_supplier_offers_minimum"),
    ("supplier_offers", {"lead_time_days": -1}, "ck_supplier_offers_lead_time"),
    ("supplier_inventory", {"on_hand": -1}, "ck_supplier_inventory_on_hand"),
    ("supplier_inventory", {"reserved": -1}, "ck_supplier_inventory_reserved"),
    ("supplier_inventory", {"on_hand": 2, "reserved": 3}, "ck_supplier_inventory_reserved"),
    ("cart_items", {"quantity": 0}, "ck_cart_items_quantity"),
    ("cart_items", {"quantity": -1}, "ck_cart_items_quantity"),
    ("shopping_carts", {"customer_id": None, "guest_token_hash": None}, "ck_shopping_carts_owner"),
])
def test_storefront_rejects_invalid_values(upgraded_database, table, values, check):
    connection, tables, _, _ = upgraded_database
    with pytest.raises(sa.exc.IntegrityError, match=check):
        with connection.begin_nested():
            connection.execute(tables[table].update().values(**values))


def test_storefront_rejects_cart_with_both_owners(upgraded_database):
    connection, tables, ids, _ = upgraded_database
    with pytest.raises(sa.exc.IntegrityError, match="ck_shopping_carts_owner"):
        with connection.begin_nested():
            connection.execute(tables["shopping_carts"].update().where(
                tables["shopping_carts"].c.id == ids["cart"],
            ).values(guest_token_hash="b" * 64))


@pytest.mark.parametrize("table,key,changes", [
    ("product_categories", "category", {}), ("brands", "brand", {}),
    ("suppliers", "supplier", {}), ("product_images", "image", {}),
    ("supplier_offers", "offer", {"supplier_sku": "different-sku"}),
    ("supplier_offers", "offer", {"variant_id": "other_variant"}),
    ("supplier_inventory", "inventory", {}),
    ("shopping_carts", "cart", {}), ("shopping_carts", "guest_cart", {}),
    ("cart_items", "cart_item", {}), ("order_status_history", "history", {}),
])
def test_storefront_rejects_duplicate_unique_keys(upgraded_database, table, key, changes):
    connection, tables, ids, _ = upgraded_database
    target = tables[table]
    row = dict(connection.execute(sa.select(target).where(target.c.id == ids[key])).mappings().one())
    row.update(id=uuid4().hex)
    row.update({name: ids.get(value, value) for name, value in changes.items()})
    with pytest.raises(sa.exc.IntegrityError, match="UNIQUE constraint failed"):
        with connection.begin_nested():
            connection.execute(target.insert().values(**row))


@pytest.mark.parametrize("table,key", [("suppliers", "supplier"), ("supplier_offers", "offer")])
def test_storefront_restricts_deleting_referenced_supplier_or_offer(upgraded_database, table, key):
    connection, tables, ids, _ = upgraded_database
    with pytest.raises(sa.exc.IntegrityError, match="FOREIGN KEY constraint failed"):
        with connection.begin_nested():
            connection.execute(tables[table].delete().where(tables[table].c.id == ids[key]))


def test_storefront_delete_actions_and_inventory_boundary(upgraded_database):
    connection, tables, ids, _ = upgraded_database
    for table, key, column in (
        ("product_categories", "category", "category_id"), ("brands", "brand", "brand_id"),
    ):
        connection.execute(tables[table].delete().where(tables[table].c.id == ids[key]))
        assert connection.scalar(sa.select(tables["products"].c[column])) is None
    connection.execute(tables["supplier_inventory"].update().values(on_hand=3, reserved=3))
    inventory = connection.execute(sa.select(tables["supplier_inventory"])).mappings().one()
    assert inventory["on_hand"] == inventory["reserved"] == 3
    connection.execute(tables["shopping_carts"].delete().where(tables["shopping_carts"].c.id == ids["cart"]))
    assert connection.scalar(sa.select(sa.func.count()).select_from(tables["cart_items"])) == 0
    connection.execute(tables["orders"].delete())
    for name in ("order_items", "order_status_history"):
        assert connection.scalar(sa.select(sa.func.count()).select_from(tables[name])) == 0
    connection.execute(tables["supplier_offers"].delete())
    assert connection.scalar(sa.select(sa.func.count()).select_from(tables["supplier_inventory"])) == 0
    assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []