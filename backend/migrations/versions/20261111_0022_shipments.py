"""Multiple shipment records and tracking events per customer order."""

from alembic import op
import sqlalchemy as sa

revision = "20261111_0022"
down_revision = "20261111_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("supplier_fulfillment_status", sa.String(length=48), nullable=False, server_default="pending"))
    op.create_table(
        "shipments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("shipment_number", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("carrier", sa.String(length=120), nullable=False),
        sa.Column("tracking_number", sa.String(length=180), nullable=False),
        sa.Column("tracking_url", sa.String(length=1000), nullable=True),
        sa.Column("estimated_delivery_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("customer_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("carrier", "tracking_number", name="uq_shipments_carrier_tracking"),
        sa.UniqueConstraint("shipment_number"),
    )
    for name in ("order_id", "status"):
        op.create_index(f"ix_shipments_{name}", "shipments", [name])
    op.create_index("ix_shipments_shipment_number", "shipments", ["shipment_number"], unique=True)
    op.create_table(
        "shipment_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shipment_id", sa.Uuid(), nullable=False),
        sa.Column("order_item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shipment_id", "order_item_id", name="uq_shipment_items_order_item"),
        sa.CheckConstraint("quantity > 0", name="ck_shipment_items_quantity"),
    )
    for name in ("shipment_id", "order_item_id"):
        op.create_index(f"ix_shipment_items_{name}", "shipment_items", [name])
    op.create_table(
        "shipment_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shipment_id", sa.Uuid(), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=24), nullable=False),
        sa.Column("event_key", sa.String(length=180), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shipment_id", "event_key", name="uq_shipment_events_event_key"),
    )
    op.create_index("ix_shipment_events_shipment_id", "shipment_events", ["shipment_id"])


def downgrade() -> None:
    op.drop_index("ix_shipment_events_shipment_id", table_name="shipment_events")
    op.drop_table("shipment_events")
    for name in ("order_item_id", "shipment_id"):
        op.drop_index(f"ix_shipment_items_{name}", table_name="shipment_items")
    op.drop_table("shipment_items")
    op.drop_index("ix_shipments_shipment_number", table_name="shipments")
    op.drop_index("ix_shipments_status", table_name="shipments")
    op.drop_index("ix_shipments_order_id", table_name="shipments")
    op.drop_table("shipments")
    op.drop_column("orders", "supplier_fulfillment_status")
