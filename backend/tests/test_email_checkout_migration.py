"""Migration 0023 DDL matches durable email and checkout idempotency models."""

import importlib.util
from io import StringIO
from pathlib import Path

from sqlalchemy import UniqueConstraint
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

from app.models import EmailNotification, Order


def load_revision():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261111_0023_transactional_email_checkout_idempotency.py"
    spec = importlib.util.spec_from_file_location("email_checkout_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (module.revision, module.down_revision) == ("20261111_0023", "20261111_0022")
    return module


def test_email_checkout_postgres_upgrade_and_downgrade_sql():
    migration = load_revision()
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
    sql = " ".join(output.getvalue().split())
    assert "ADD COLUMN checkout_idempotency_key VARCHAR(36)" in sql
    assert "ADD COLUMN checkout_request_hash VARCHAR(64)" in sql
    assert "ADD COLUMN checkout_request JSON" in sql
    assert "CONSTRAINT uq_orders_customer_checkout_key UNIQUE (customer_id, checkout_idempotency_key)" in sql
    table_ddl = str(CreateTable(EmailNotification.__table__).compile(dialect=postgresql.dialect()))
    assert f"CREATE TABLE email_notifications" in sql
    for clause in table_ddl[table_ddl.index("(") + 1:table_ddl.rindex(")")].splitlines():
        clause = clause.strip().rstrip(",")
        if clause:
            assert " ".join(clause.split()) in sql
    for index in EmailNotification.__table__.indexes:
        assert str(CreateIndex(index).compile(dialect=postgresql.dialect())) in sql

    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.downgrade()
    downgrade = output.getvalue()
    assert "DROP TABLE email_notifications" in downgrade
    assert "DROP CONSTRAINT uq_orders_customer_checkout_key" in downgrade
    for column in ("checkout_request", "checkout_request_hash", "checkout_idempotency_key"):
        assert f"DROP COLUMN {column}" in downgrade


def test_checkout_idempotency_schema_is_customer_scoped():
    constraints = {constraint.name: constraint for constraint in Order.__table__.constraints}
    constraint = constraints["uq_orders_customer_checkout_key"]
    assert [column.name for column in constraint.columns] == ["customer_id", "checkout_idempotency_key"]
    unique_columns = {
        column.name
        for constraint in EmailNotification.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
        for column in constraint.columns
    }
    assert "notification_key" in unique_columns
