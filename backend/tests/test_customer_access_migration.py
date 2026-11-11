"""Exercise revision 0016 directly, without importing the app or its engine."""

import importlib.util
from datetime import datetime
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


@pytest.fixture
def revision():
    path = (
        Path(__file__).resolve().parents[1]
        / "migrations" / "versions" / "20261111_0016_customer_access_control.py"
    )
    spec = importlib.util.spec_from_file_location("customer_access_revision", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.revision == "20261111_0016"
    assert migration.down_revision == "20261111_0015"
    return migration


def _legacy_rows(connection, customers):
    return [dict(row) for row in connection.execute(
        sa.select(customers).order_by(customers.c.email)
    ).mappings()]


def _raw_insert(connection, **access_values):
    # No ORM or Python column defaults: only the migrated database supplies them.
    values = {
        "id": uuid4().hex, "email": f"{uuid4().hex}@example.com",
        "first_name": "New", "last_name": "Customer",
        "password_hash": "opaque-password-hash", "marketing_opt_in": 0,
        "email_verified": 1, "created_at": "2026-11-11 12:00:00",
        **access_values,
    }
    columns = ", ".join(values)
    parameters = ", ".join(f":{name}" for name in values)
    connection.execute(sa.text(
        f"INSERT INTO customers ({columns}) VALUES ({parameters})"
    ), values)
    return values["id"]


@pytest.fixture
def legacy_database(tmp_path: Path):
    metadata = sa.MetaData()
    customers = sa.Table(
        "customers", metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True, index=True),
        sa.Column("first_name", sa.String(120), nullable=False),
        sa.Column("last_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("marketing_opt_in", sa.Boolean(), nullable=False),
        sa.Column("email_verified", sa.Boolean(), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    engine = sa.create_engine(sa.URL.create(
        "sqlite", database=str(tmp_path / "customer_access.sqlite"),
    ))
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
            metadata.create_all(connection)
            connection.execute(customers.insert(), [
                {
                    "id": uuid4(), "email": f"legacy-{number}@example.com",
                    "first_name": "Legacy", "last_name": f"Customer {number}",
                    "password_hash": f"unchanged-password-hash-{number}",
                    "marketing_opt_in": bool(number), "email_verified": verified,
                    "created_at": datetime(2026, 11, 10, 12, number),
                }
                for number, verified in enumerate((False, True))
            ])
            connection.commit()
            yield connection, customers
    finally:
        engine.dispose()


@pytest.fixture
def upgraded_database(legacy_database, revision):
    connection, customers = legacy_database
    before = _legacy_rows(connection, customers)
    assert len(before) == 2
    with Operations.context(MigrationContext.configure(connection)):
        revision.upgrade()
    assert _legacy_rows(connection, customers) == before
    return connection, customers


def test_upgrade_preserves_legacy_customers_and_adds_database_defaults(upgraded_database):
    connection, customers = upgraded_database
    columns = {column["name"]: column for column in sa.inspect(connection).get_columns("customers")}
    assert set(columns) == set(customers.c.keys()) | {"role", "auth_version"}
    assert isinstance(columns["role"]["type"], sa.String)
    assert columns["role"]["type"].length == 20
    assert isinstance(columns["auth_version"]["type"], sa.Integer)
    for name in ("role", "auth_version"):
        assert columns[name]["nullable"] is False
        assert columns[name]["default"] is not None
    assert connection.execute(sa.text(
        "SELECT role, auth_version FROM customers ORDER BY email"
    )).all() == [("customer", 0), ("customer", 0)]

    customer_id = _raw_insert(connection)
    assert connection.execute(sa.text(
        "SELECT role, auth_version FROM customers WHERE id = :id"
    ), {"id": customer_id}).one() == ("customer", 0)
    assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1


@pytest.mark.parametrize("role", ["customer", "supplier", "admin"])
def test_valid_roles_and_nonnegative_versions_are_persisted(upgraded_database, role):
    connection, _ = upgraded_database
    customer_id = _raw_insert(connection, role=role, auth_version=0)
    assert connection.execute(sa.text(
        "SELECT role, auth_version FROM customers WHERE id = :id"
    ), {"id": customer_id}).one() == (role, 0)
    connection.execute(sa.text(
        "UPDATE customers SET role = :role, auth_version = 7 WHERE id = :id"
    ), {"role": role, "id": customer_id})
    assert connection.execute(sa.text(
        "SELECT role, auth_version FROM customers WHERE id = :id"
    ), {"id": customer_id}).one() == (role, 7)


@pytest.mark.parametrize("operation", ["insert", "update"])
@pytest.mark.parametrize("column,value,error", [
    ("role", "superadmin", "CHECK constraint failed: ck_customers_role"),
    ("auth_version", -1, "CHECK constraint failed: ck_customers_auth_version"),
    ("role", None, "NOT NULL constraint failed: customers.role"),
    ("auth_version", None, "NOT NULL constraint failed: customers.auth_version"),
])
def test_raw_sql_rejects_invalid_access_values(upgraded_database, operation, column, value, error):
    connection, customers = upgraded_database
    before = connection.execute(sa.text("SELECT * FROM customers ORDER BY email")).all()
    with pytest.raises(sa.exc.IntegrityError, match=error):
        with connection.begin_nested():
            if operation == "insert":
                _raw_insert(connection, **{column: value})
            else:
                connection.execute(sa.text(
                    f"UPDATE customers SET {column} = :value"
                ), {"value": value})
    assert connection.execute(sa.text("SELECT * FROM customers ORDER BY email")).all() == before
    assert len(_legacy_rows(connection, customers)) == 2


def test_downgrade_preserves_all_customer_data_and_legacy_schema(legacy_database, revision):
    connection, customers = legacy_database
    inspector = sa.inspect(connection)
    original_indexes = inspector.get_indexes("customers")
    original_pk = inspector.get_pk_constraint("customers")
    original_uniques = inspector.get_unique_constraints("customers")
    original_checks = inspector.get_check_constraints("customers")
    with Operations.context(MigrationContext.configure(connection)):
        revision.upgrade()
    for version, role in enumerate(("customer", "supplier", "admin")):
        _raw_insert(connection, role=role, auth_version=version)
    before = _legacy_rows(connection, customers)
    assert len(before) == 5

    with Operations.context(MigrationContext.configure(connection)):
        revision.downgrade()

    inspector = sa.inspect(connection)
    assert inspector.get_table_names() == ["customers"]
    assert {column["name"] for column in inspector.get_columns("customers")} == set(customers.c.keys())
    assert inspector.get_indexes("customers") == original_indexes
    assert inspector.get_pk_constraint("customers") == original_pk
    assert inspector.get_unique_constraints("customers") == original_uniques
    assert inspector.get_check_constraints("customers") == original_checks
    assert _legacy_rows(connection, customers) == before
    assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []

    # Catch leftover constraints on a subsequent deployment of the revision.
    with Operations.context(MigrationContext.configure(connection)):
        revision.upgrade()
    assert _legacy_rows(connection, customers) == before
    assert connection.execute(sa.text(
        "SELECT role, auth_version FROM customers"
    )).all() == [("customer", 0)] * 5


def test_postgresql_offline_upgrade_has_column_defaults_and_checks(revision):
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={
        "as_sql": True, "output_buffer": output,
    })
    with Operations.context(context):
        revision.upgrade()
    sql = " ".join(output.getvalue().split())
    assert "ADD COLUMN role VARCHAR(20) DEFAULT 'customer' NOT NULL" in sql
    assert "CONSTRAINT ck_customers_role CHECK (role IN ('customer', 'supplier', 'admin'))" in sql
    assert "ADD COLUMN auth_version INTEGER DEFAULT '0' NOT NULL" in sql
    assert "CONSTRAINT ck_customers_auth_version CHECK (auth_version >= 0)" in sql

    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={
        "as_sql": True, "output_buffer": output,
    })
    with Operations.context(context):
        revision.downgrade()
    sql = " ".join(output.getvalue().split())
    assert "ALTER TABLE customers DROP COLUMN auth_version;" in sql
    assert "ALTER TABLE customers DROP COLUMN role;" in sql