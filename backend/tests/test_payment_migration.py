"""Payment ledger migration: disposable SQLite round-trip and Postgres SQL."""

import importlib.util
from io import StringIO
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def revision():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261111_0020_payment_transactions.py"
    spec = importlib.util.spec_from_file_location("payment_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (module.revision, module.down_revision) == ("20261111_0020", "20261111_0019")
    return module


def test_ledger_upgrade_downgrade_and_existing_capture_backfill(tmp_path):
    migration = revision()
    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "payments.sqlite")))
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE orders (id INTEGER PRIMARY KEY, payment_status VARCHAR(48), total_amount INTEGER)")
            connection.exec_driver_sql("INSERT INTO orders VALUES (1, 'paid', 1500), (2, 'unpaid', 2000)")
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            assert connection.exec_driver_sql("SELECT captured_amount FROM orders ORDER BY id").scalars().all() == [1500, 0]
            assert "payment_transactions" in sa.inspect(connection).get_table_names()
            constraints = sa.inspect(connection).get_unique_constraints("payment_transactions")
            assert {row["name"] for row in constraints} >= {"uq_payment_transactions_event", "uq_payment_transactions_idempotency"}
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert connection.exec_driver_sql("SELECT total_amount FROM orders ORDER BY id").scalars().all() == [1500, 2000]
            assert "payment_transactions" not in sa.inspect(connection).get_table_names()
    finally:
        engine.dispose()


def test_payment_postgres_ddl_compiles():
    migration = revision()
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
    sql = output.getvalue()
    assert "CREATE TABLE payment_transactions" in sql
    assert "UNIQUE (event_key)" in sql and "UNIQUE (idempotency_key)" in sql
    assert "CREATE UNIQUE INDEX ix_orders_stripe_payment_intent_id" in sql
