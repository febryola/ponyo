"""Supplier purchase order migration: disposable SQLite and offline Postgres DDL."""

import importlib.util
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

from app.models import (
    Order,
    SupplierAccount,
    SupplierConfirmation,
    SupplierPurchaseOrder,
    SupplierPurchaseOrderItem,
)


SUPPLIER_TABLES = (
    SupplierAccount.__table__,
    SupplierPurchaseOrder.__table__,
    SupplierPurchaseOrderItem.__table__,
    SupplierConfirmation.__table__,
)


def revision():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261111_0021_supplier_purchase_orders.py"
    spec = importlib.util.spec_from_file_location("supplier_purchase_order_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (module.revision, module.down_revision) == ("20261111_0021", "20261111_0020")
    assert module.branch_labels is None and module.depends_on is None
    return module


def assert_schema_matches_models(connection):
    inspector = sa.inspect(connection)
    for table in SUPPLIER_TABLES:
        columns = inspector.get_columns(table.name)
        assert [column["name"] for column in columns] == list(table.columns.keys())
        for column in columns:
            expected = table.c[column["name"]]
            assert column["type"].compile(dialect=connection.dialect) == expected.type.compile(dialect=connection.dialect)
            assert column["nullable"] == expected.nullable
            assert column["default"] is None
        assert inspector.get_pk_constraint(table.name)["constrained_columns"] == list(table.primary_key.columns.keys())
        assert {
            (index["name"], tuple(index["column_names"]), bool(index["unique"]))
            for index in inspector.get_indexes(table.name)
        } == {
            (index.name, tuple(column.name for column in index.columns), index.unique)
            for index in table.indexes
        }
        assert {
            (constraint["name"], tuple(constraint["column_names"]))
            for constraint in inspector.get_unique_constraints(table.name)
        } == {
            (constraint.name, tuple(column.name for column in constraint.columns))
            for constraint in table.constraints if isinstance(constraint, sa.UniqueConstraint)
        }
        assert {
            (tuple(fk["constrained_columns"]), fk["referred_table"], tuple(fk["referred_columns"]), fk["options"].get("ondelete"))
            for fk in inspector.get_foreign_keys(table.name)
        } == {
            ((fk.parent.name,), fk.column.table.name, (fk.column.name,), fk.ondelete)
            for fk in table.foreign_keys
        }
        assert inspector.get_check_constraints(table.name) == []


def test_supplier_upgrade_downgrade_and_existing_order_defaults(tmp_path):
    migration = revision()
    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "suppliers.sqlite")))
    parent_names = ("orders", "customers", "suppliers", "order_items", "supplier_offers", "product_variants")
    ids = {name: uuid4() for name in parent_names}
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            parents = sa.MetaData()
            for name in parent_names:
                sa.Table(name, parents, sa.Column("id", sa.Uuid(), primary_key=True))
            parents.create_all(connection)
            for name in parent_names:
                connection.execute(parents.tables[name].insert().values(id=ids[name]))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            assert_schema_matches_models(connection)
            retry_columns = {column["name"]: column for column in sa.inspect(connection).get_columns("orders")}
            for name in ("supplier_retry_count", "supplier_retry_at"):
                expected = Order.__table__.c[name]
                assert retry_columns[name]["nullable"] == expected.nullable
                assert retry_columns[name]["type"].compile(dialect=connection.dialect) == expected.type.compile(dialect=connection.dialect)
            assert retry_columns["supplier_retry_count"]["default"].strip("'\"") == "0"
            assert retry_columns["supplier_retry_at"]["default"] is None
            assert sa.inspect(connection).get_indexes("orders") == [{
                "name": "ix_orders_supplier_retry_at", "column_names": ["supplier_retry_at"],
                "unique": 0, "dialect_options": {},
            }]
            assert connection.exec_driver_sql("SELECT supplier_retry_count, supplier_retry_at FROM orders").one() == (0, None)
            connection.execute(parents.tables["orders"].insert().values(id=uuid4()))
            assert connection.exec_driver_sql("SELECT supplier_retry_count, supplier_retry_at FROM orders").all() == [(0, None), (0, None)]

            account = SupplierAccount.__table__
            po = SupplierPurchaseOrder.__table__
            item = SupplierPurchaseOrderItem.__table__
            confirmation = SupplierConfirmation.__table__
            po_id, item_id = uuid4(), uuid4()
            connection.execute(account.insert().values(customer_id=ids["customers"], supplier_id=ids["suppliers"]))
            po_values = dict(
                id=po_id, po_number="PO-1", order_id=ids["orders"], supplier_id=ids["suppliers"],
                idempotency_key="po-1", currency="JPY", total_cost=100, shipping_address={"city": "Tokyo"},
            )
            connection.execute(po.insert().values(**po_values))
            item_values = dict(
                id=item_id, purchase_order_id=po_id, order_item_id=ids["order_items"],
                offer_id=ids["supplier_offers"], route_attempt=1, quantity=1, supplier_sku="SKU-1",
                product_name="Product", unit_cost=100, variant_id=ids["product_variants"],
            )
            connection.execute(item.insert().values(**item_values))
            confirmation_values = dict(supplier_id=ids["suppliers"], purchase_order_id=po_id, event_id="event-1", decision="accepted")
            connection.execute(confirmation.insert().values(**confirmation_values))
            for changes in (
                {"id": uuid4(), "idempotency_key": "po-2"},
                {"id": uuid4(), "po_number": "PO-2", "generation": 2},
                {"id": uuid4(), "po_number": "PO-2", "idempotency_key": "po-2"},
            ):
                with pytest.raises(sa.exc.IntegrityError):
                    with connection.begin_nested():
                        connection.execute(po.insert().values(**(po_values | changes)))
            with pytest.raises(sa.exc.IntegrityError):
                with connection.begin_nested():
                    connection.execute(item.insert().values(**(item_values | {"id": uuid4()})))
            with pytest.raises(sa.exc.IntegrityError):
                with connection.begin_nested():
                    connection.execute(confirmation.insert().values(**confirmation_values))
            with pytest.raises(sa.exc.IntegrityError):
                with connection.begin_nested():
                    connection.execute(po.delete().where(po.c.id == po_id))
            for name in ("orders", "suppliers", "order_items", "supplier_offers", "product_variants"):
                with pytest.raises(sa.exc.IntegrityError):
                    with connection.begin_nested():
                        connection.execute(parents.tables[name].delete().where(parents.tables[name].c.id == ids[name]))
            connection.execute(parents.tables["customers"].delete())
            assert connection.execute(sa.select(sa.func.count()).select_from(account)).scalar_one() == 0
            connection.execute(confirmation.delete())
            connection.execute(po.delete())
            assert connection.execute(sa.select(sa.func.count()).select_from(item)).scalar_one() == 0
            # Leave populated dependent tables for downgrade to exercise drop order.
            connection.execute(po.insert().values(**po_values))
            connection.execute(item.insert().values(**item_values))
            connection.execute(confirmation.insert().values(**confirmation_values))
            existing_ids = connection.execute(sa.select(parents.tables["orders"].c.id)).scalars().all()
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert set(sa.inspect(connection).get_table_names()) == set(parent_names)
            assert [column["name"] for column in sa.inspect(connection).get_columns("orders")] == ["id"]
            assert sa.inspect(connection).get_indexes("orders") == []
            assert set(connection.execute(sa.select(parents.tables["orders"].c.id)).scalars().all()) == set(existing_ids)
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        engine.dispose()


def test_supplier_postgres_upgrade_ddl_matches_models():
    migration = revision()
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
    sql = " ".join(output.getvalue().split())
    dialect = postgresql.dialect()
    for table in SUPPLIER_TABLES:
        # Compare individual clauses so constraint ordering does not affect parity.
        ddl = str(CreateTable(table).compile(dialect=dialect))
        assert f"CREATE TABLE {table.name}" in sql
        for clause in ddl[ddl.index("(") + 1:ddl.rindex(")")].splitlines():
            clause = clause.strip().rstrip(",")
            if clause:
                assert " ".join(clause.split()) in sql
        for index in table.indexes:
            assert str(CreateIndex(index).compile(dialect=dialect)) in sql
    assert "ALTER TABLE orders ADD COLUMN supplier_retry_count INTEGER DEFAULT '0' NOT NULL" in sql
    assert "ALTER TABLE orders ADD COLUMN supplier_retry_at TIMESTAMP WITH TIME ZONE" in sql
    assert "CREATE INDEX ix_orders_supplier_retry_at ON orders (supplier_retry_at)" in sql


def test_supplier_postgres_downgrade_ddl_compiles():
    migration = revision()
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.downgrade()
    sql = output.getvalue()
    table_positions = [sql.index(f"DROP TABLE {table.name}") for table in reversed(SUPPLIER_TABLES)]
    assert table_positions == sorted(table_positions)
    for table in SUPPLIER_TABLES:
        for index in table.indexes:
            assert sql.index(f"DROP INDEX {index.name};") < sql.index(f"DROP TABLE {table.name};")
    assert sql.index("DROP INDEX ix_orders_supplier_retry_at;") < sql.index("ALTER TABLE orders DROP COLUMN supplier_retry_at;")
    assert "ALTER TABLE orders DROP COLUMN supplier_retry_count;" in sql