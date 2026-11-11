import pytest
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from app.db import _enable_sqlite_foreign_keys, engine


@pytest.mark.asyncio
async def test_sqlite_connections_enforce_declared_foreign_keys():
    if engine.dialect.name == "sqlite":
        assert event.contains(engine.sync_engine, "connect", _enable_sqlite_foreign_keys)
    temporary_engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    event.listen(temporary_engine.sync_engine, "connect", _enable_sqlite_foreign_keys)
    try:
        async with temporary_engine.begin() as connection:
            assert await connection.scalar(text("PRAGMA foreign_keys")) == 1
            await connection.execute(text("CREATE TABLE parent (id INTEGER PRIMARY KEY)"))
            await connection.execute(text("CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))"))
            with pytest.raises(IntegrityError):
                await connection.execute(text("INSERT INTO child VALUES (999)"))
    finally:
        await temporary_engine.dispose()