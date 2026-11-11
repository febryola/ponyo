"""Exercise the revision directly, without importing or connecting to the app DB."""

import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_email_verification_migration_upgrade_and_downgrade(tmp_path: Path) -> None:
    revision_path = (
        Path(__file__).resolve().parents[1]
        / "migrations" / "versions" / "20261111_0014_email_verification.py"
    )
    spec = importlib.util.spec_from_file_location("email_verification_revision", revision_path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.revision == "20261111_0014"
    assert migration.down_revision == "20261111_0013"

    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "migration.sqlite")))
    metadata = sa.MetaData()
    customers = sa.Table(
        "customers", metadata,
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True, index=True),
        sa.Column("first_name", sa.String(120), nullable=False),
        sa.Column("last_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("marketing_opt_in", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    legacy = {
        "id": uuid4(), "email": "legacy@example.com", "first_name": "Legacy",
        "last_name": "Customer", "password_hash": "legacy-password-hash",
        "marketing_opt_in": True, "created_at": datetime.now(timezone.utc),
    }

    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            metadata.create_all(connection)
            connection.execute(customers.insert().values(**legacy))
            original_row = dict(connection.execute(sa.select(customers)).mappings().one())
            original_indexes = sa.inspect(connection).get_indexes("customers")

            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()

            inspector = sa.inspect(connection)
            columns = {column["name"]: column for column in inspector.get_columns("customers")}
            verified = columns["email_verified"]
            assert isinstance(verified["type"], sa.Boolean)
            assert verified["nullable"] is False
            assert verified["default"] is not None
            upgraded_customers = sa.Table("customers", sa.MetaData(), autoload_with=connection)
            assert connection.scalar(sa.select(upgraded_customers.c.email_verified)) is False
            assert {
                index["name"]: (index["column_names"], bool(index["unique"]))
                for index in inspector.get_indexes("customers")
            }["ix_customers_email_verified"] == (["email_verified"], False)

            token_columns = {
                column["name"]: column
                for column in inspector.get_columns("email_verification_tokens")
            }
            assert set(token_columns) == {
                "id", "customer_id", "token_hash", "expires_at", "used_at", "created_at",
            }
            for name, column in token_columns.items():
                assert column["nullable"] is (name == "used_at")
                assert column["default"] is None
            for name in ("id", "customer_id"):
                assert isinstance(token_columns[name]["type"], sa.CHAR)
                assert token_columns[name]["type"].length == 32
            assert isinstance(token_columns["token_hash"]["type"], sa.String)
            assert token_columns["token_hash"]["type"].length == 64
            for name in ("expires_at", "used_at", "created_at"):
                assert isinstance(token_columns[name]["type"], sa.DateTime)
            assert inspector.get_pk_constraint("email_verification_tokens")["constrained_columns"] == ["id"]
            foreign_key, = inspector.get_foreign_keys("email_verification_tokens")
            assert foreign_key["constrained_columns"] == ["customer_id"]
            assert foreign_key["referred_table"] == "customers"
            assert foreign_key["referred_columns"] == ["id"]
            assert foreign_key["options"]["ondelete"] == "CASCADE"
            assert {
                index["name"]: (index["column_names"], bool(index["unique"]))
                for index in inspector.get_indexes("email_verification_tokens")
            } == {
                "ix_email_verification_tokens_customer_id": (["customer_id"], False),
                "ix_email_verification_tokens_token_hash": (["token_hash"], True),
            }
            assert inspector.get_unique_constraints("email_verification_tokens") == []

            # The server default also protects inserts that omit the new column.
            connection.execute(customers.insert().values(**{**legacy, "id": uuid4(), "email": "new@example.com"}))
            assert connection.execute(sa.select(upgraded_customers.c.email_verified)).scalars().all() == [False, False]

            tokens = sa.Table("email_verification_tokens", sa.MetaData(), autoload_with=connection)
            token = {
                "id": uuid4().hex, "customer_id": legacy["id"].hex,
                "token_hash": "a" * 64, "expires_at": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc),
            }
            connection.execute(tokens.insert().values(**token))
            assert connection.scalar(sa.select(tokens.c.used_at)) is None
            with pytest.raises(sa.exc.IntegrityError):
                with connection.begin_nested():
                    connection.execute(tokens.insert().values(**{**token, "id": uuid4().hex}))

            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()

            inspector = sa.inspect(connection)
            assert "email_verification_tokens" not in inspector.get_table_names()
            assert {column["name"] for column in inspector.get_columns("customers")} == set(customers.c.keys())
            assert inspector.get_indexes("customers") == original_indexes
            retained = connection.execute(sa.select(customers).where(customers.c.id == legacy["id"])).mappings().one()
            assert dict(retained) == original_row
            assert connection.scalar(sa.select(sa.func.count()).select_from(customers)) == 2
    finally:
        engine.dispose()