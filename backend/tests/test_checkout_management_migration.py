"""Pricing migration round-trip on disposable SQLite and PostgreSQL DDL."""

import importlib.util
from io import StringIO
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def revision():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261111_0019_checkout_totals_coupons.py"
    spec = importlib.util.spec_from_file_location("checkout_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.revision == "20261111_0019"
    assert module.down_revision == "20261111_0018"
    return module


def test_upgrade_backfills_historic_totals_and_preserves_rows(tmp_path):
    migration = revision()
    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "checkout.sqlite")))
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE orders (id INTEGER PRIMARY KEY, total_amount INTEGER NOT NULL)")
            connection.exec_driver_sql("CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, quantity INTEGER, unit_price INTEGER)")
            connection.exec_driver_sql("INSERT INTO orders VALUES (1, 4200), (2, 0)")
            connection.exec_driver_sql("INSERT INTO order_items VALUES (1, 1, 2, 1500)")
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            row = connection.exec_driver_sql("SELECT subtotal_amount, shipping_amount, tax_amount, discount_amount FROM orders WHERE id=1").one()
            assert tuple(row) == (3000, 1200, 0, 0)
            assert connection.exec_driver_sql("SELECT product_snapshot FROM order_items").scalar() == "{}"
            assert "coupons" in sa.inspect(connection).get_table_names()
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert connection.exec_driver_sql("SELECT total_amount FROM orders WHERE id=1").scalar() == 4200
            assert "coupons" not in sa.inspect(connection).get_table_names()
    finally:
        engine.dispose()


def test_postgres_migration_compiles_money_cache_and_coupon_indexes():
    migration = revision()
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
    sql = output.getvalue()
    assert "CREATE TABLE coupons" in sql
    assert "CREATE UNIQUE INDEX ix_coupons_code" in sql
    assert "ALTER TABLE orders ADD COLUMN tax_amount INTEGER DEFAULT '0' NOT NULL" in sql
    assert "ALTER TABLE order_items ADD COLUMN product_snapshot JSON" in sql
