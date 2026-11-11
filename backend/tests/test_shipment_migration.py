"""Shipment migration parity and reversible SQLite DDL checks."""

import importlib.util
from io import StringIO
from pathlib import Path
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

from app.models import Shipment, ShipmentEvent, ShipmentItem


TABLES = (Shipment.__table__, ShipmentItem.__table__, ShipmentEvent.__table__)


def migration_module():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261111_0022_shipments.py"
    spec = importlib.util.spec_from_file_location("shipment_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert (module.revision, module.down_revision) == ("20261111_0022", "20261111_0021")
    return module


def test_shipment_migration_schema_and_downgrade(tmp_path):
    migration = migration_module()
    engine = sa.create_engine(sa.URL.create("sqlite", database=str(tmp_path / "shipments.sqlite")))
    try:
        with engine.begin() as connection:
            parents = sa.MetaData()
            for table in ("orders", "customers", "order_items"):
                sa.Table(table, parents, sa.Column("id", sa.Uuid(), primary_key=True))
            parents.create_all(connection)
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            inspector = sa.inspect(connection)
            assert {"shipments", "shipment_items", "shipment_events"}.issubset(inspector.get_table_names())
            assert inspector.get_columns("orders")[-1]["name"] == "supplier_fulfillment_status"
            for table in TABLES:
                columns = inspector.get_columns(table.name)
                assert [column["name"] for column in columns] == list(table.columns.keys())
                assert inspector.get_pk_constraint(table.name)["constrained_columns"] == list(table.primary_key.columns.keys())
                assert {
                    (index["name"], tuple(index["column_names"]), bool(index["unique"]))
                    for index in inspector.get_indexes(table.name)
                } == {
                    (index.name, tuple(column.name for column in index.columns), index.unique)
                    for index in table.indexes
                }
            assert inspector.get_unique_constraints("shipment_items") == [{
                "name": "uq_shipment_items_order_item", "column_names": ["shipment_id", "order_item_id"],
            }]
            with Operations.context(MigrationContext.configure(connection)):
                migration.downgrade()
            assert not {"shipments", "shipment_items", "shipment_events"}.intersection(sa.inspect(connection).get_table_names())
            assert [column["name"] for column in sa.inspect(connection).get_columns("orders")] == ["id"]
    finally:
        engine.dispose()


def test_shipment_postgres_upgrade_and_downgrade_ddl_compile():
    migration = migration_module()
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.upgrade()
    sql = " ".join(output.getvalue().split())
    dialect = postgresql.dialect()
    for table in TABLES:
        ddl = str(CreateTable(table).compile(dialect=dialect))
        assert f"CREATE TABLE {table.name}" in sql
        for clause in ddl[ddl.index("(") + 1:ddl.rindex(")")].splitlines():
            clause = clause.strip().rstrip(",")
            if clause:
                assert " ".join(clause.split()) in sql
        for index in table.indexes:
            assert str(CreateIndex(index).compile(dialect=dialect)) in sql
    assert "ADD COLUMN supplier_fulfillment_status VARCHAR(48) DEFAULT 'pending' NOT NULL" in sql
    output = StringIO()
    with Operations.context(MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})):
        migration.downgrade()
    assert "ALTER TABLE orders DROP COLUMN supplier_fulfillment_status" in output.getvalue()
