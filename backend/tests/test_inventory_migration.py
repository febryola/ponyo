"""Revision 0017 against disposable SQLite and PostgreSQL offline DDL only."""

import importlib.util
from io import StringIO
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def revision():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261111_0017_inventory_expiry.py"
    spec = importlib.util.spec_from_file_location("inventory_revision", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.revision == "20261111_0017"
    assert module.down_revision == "20261111_0016"
    return module


def test_upgrade_downgrade_preserves_legacy_rows_and_indexes(tmp_path):
    migration = revision()
    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "inventory.sqlite")))
    metadata = sa.MetaData()
    orders = sa.Table("orders", metadata, sa.Column("id", sa.Integer, primary_key=True),
                      sa.Column("status", sa.String(48), nullable=False, index=True))
    inventory = sa.Table("supplier_inventory", metadata, sa.Column("id", sa.Integer, primary_key=True),
                         sa.Column("on_hand", sa.Integer, nullable=False),
                         sa.Column("reserved", sa.Integer, nullable=False),
                         sa.CheckConstraint("reserved >= 0 AND reserved <= on_hand", name="ck_reserved"))
    try:
        with engine.begin() as connection:
            metadata.create_all(connection)
            connection.execute(orders.insert().values(id=1, status="pending_payment"))
            connection.execute(inventory.insert().values(id=1, on_hand=12, reserved=3))
            before = {table.name: connection.execute(sa.select(table)).all() for table in (orders, inventory)}
            indexes = sa.inspect(connection).get_indexes("orders")
            checks = sa.inspect(connection).get_check_constraints("supplier_inventory")
            for _ in range(2):
                with Operations.context(MigrationContext.configure(connection)):
                    migration.upgrade()
                inspector = sa.inspect(connection)
                for name, column in (("orders", "reservation_expires_at"), ("supplier_inventory", "last_synced_at")):
                    reflected = sa.Table(name, sa.MetaData(), autoload_with=connection)
                    added = next(c for c in inspector.get_columns(name) if c["name"] == column)
                    assert added["nullable"] is True and added["default"] is None
                    assert isinstance(added["type"], sa.DateTime)
                    assert connection.scalar(sa.select(reflected.c[column])) is None
                assert {i["name"]: (i["column_names"], i["unique"]) for i in inspector.get_indexes("orders")}[
                    "ix_orders_reservation_expires_at"
                ] == (["reservation_expires_at"], 0)
                assert {table.name: connection.execute(sa.select(table)).all() for table in (orders, inventory)} == before
                connection.exec_driver_sql("UPDATE orders SET reservation_expires_at='2026-11-11 12:00:00'")
                connection.exec_driver_sql("UPDATE supplier_inventory SET last_synced_at='2026-11-11 12:00:00'")
                with Operations.context(MigrationContext.configure(connection)):
                    migration.downgrade()
                inspector = sa.inspect(connection)
                assert inspector.get_indexes("orders") == indexes
                assert inspector.get_check_constraints("supplier_inventory") == checks
                for table in (orders, inventory):
                    assert {c["name"] for c in inspector.get_columns(table.name)} == set(table.c.keys())
                    assert connection.execute(sa.select(table)).all() == before[table.name]
    finally:
        engine.dispose()


def test_postgres_offline_nullable_timezone_columns_index_and_no_backfill():
    migration = revision()
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={
        "as_sql": True, "output_buffer": output,
    })
    with Operations.context(context):
        migration.upgrade()
    sql = output.getvalue()
    assert "ALTER TABLE orders ADD COLUMN reservation_expires_at TIMESTAMP WITH TIME ZONE" in sql
    assert "ALTER TABLE supplier_inventory ADD COLUMN last_synced_at TIMESTAMP WITH TIME ZONE" in sql
    assert "CREATE INDEX ix_orders_reservation_expires_at ON orders (reservation_expires_at)" in sql
    assert all(word not in sql.upper() for word in ("NOT NULL", "DEFAULT", "UPDATE ", "DELETE "))
    output.seek(0)
    output.truncate()
    with Operations.context(context):
        migration.downgrade()
    sql = output.getvalue()
    assert "DROP INDEX ix_orders_reservation_expires_at" in sql
    assert "ALTER TABLE orders DROP COLUMN reservation_expires_at" in sql
    assert "ALTER TABLE supplier_inventory DROP COLUMN last_synced_at" in sql