from io import StringIO
from pathlib import Path
from unittest.mock import Mock

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from app.config import settings


def test_full_migration_chain_generates_postgresql_sql_without_database(monkeypatch):
    # Match the migration step's explicit DATABASE_URL in GitHub Actions.
    monkeypatch.setattr(settings, "database_url", "postgresql+asyncpg://ponyo:ponyo@localhost:5432/ponyo_ci")
    connect = Mock(side_effect=AssertionError("Offline SQL must not open a database connection"))
    monkeypatch.setattr("sqlalchemy.ext.asyncio.async_engine_from_config", connect)
    output = StringIO()
    config = Config(output_buffer=output)
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "migrations"))
    scripts = ScriptDirectory.from_config(config)

    command.upgrade(config, "head", sql=True)

    sql = output.getvalue()
    assert "BEGIN;" in sql
    assert "COMMIT;" in sql
    assert "id UUID NOT NULL" in sql
    assert "ADD CONSTRAINT uq_products_sku UNIQUE (sku)" in sql
    assert "CREATE TABLE email_verification_tokens" in sql
    for revision in scripts.walk_revisions():
        assert revision.revision in sql
    assert sql.count("-- Running upgrade") == len(list(scripts.walk_revisions()))
    connect.assert_not_called()