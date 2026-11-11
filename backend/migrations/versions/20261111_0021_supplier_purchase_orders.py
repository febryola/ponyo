"""Supplier accounts, purchase orders, confirmations, and order retry scheduling."""

from alembic import op
import sqlalchemy as sa

revision = "20261111_0021"
down_revision = "20261111_0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("supplier_retry_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("supplier_retry_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_orders_supplier_retry_at", "orders", ["supplier_retry_at"])
    op.create_table(
        "supplier_accounts",
        sa.Column("customer_id", sa.Uuid(), sa.ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("supplier_id", sa.Uuid(), sa.ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False),
    )
    op.create_index("ix_supplier_accounts_supplier_id", "supplier_accounts", ["supplier_id"])
    op.create_table(
        "supplier_purchase_orders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("po_number", sa.String(40), nullable=False),
        sa.Column("order_id", sa.Uuid(), sa.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), sa.ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False, unique=True),
        sa.Column("supplier_order_id", sa.String(180), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("total_cost", sa.Integer(), nullable=False),
        sa.Column("shipping_address", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(100), nullable=True),
        sa.Column("rejection_reason", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("order_id", "supplier_id", "generation", name="uq_supplier_po_generation"),
    )
    op.create_index("ix_supplier_purchase_orders_po_number", "supplier_purchase_orders", ["po_number"], unique=True)
    for name in ("order_id", "supplier_id", "status", "next_attempt_at"):
        op.create_index(f"ix_supplier_purchase_orders_{name}", "supplier_purchase_orders", [name])
    op.create_table(
        "supplier_purchase_order_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("purchase_order_id", sa.Uuid(), sa.ForeignKey("supplier_purchase_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_item_id", sa.Uuid(), sa.ForeignKey("order_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("offer_id", sa.Uuid(), sa.ForeignKey("supplier_offers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("route_attempt", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("supplier_sku", sa.String(120), nullable=False),
        sa.Column("product_name", sa.String(240), nullable=False),
        sa.Column("unit_cost", sa.Integer(), nullable=False),
        sa.Column("variant_id", sa.Uuid(), sa.ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False),
        sa.UniqueConstraint("order_item_id", "route_attempt", name="uq_supplier_po_item_route"),
    )
    for name in ("purchase_order_id", "order_item_id"):
        op.create_index(f"ix_supplier_purchase_order_items_{name}", "supplier_purchase_order_items", [name])
    op.create_table(
        "supplier_confirmations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("supplier_id", sa.Uuid(), sa.ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("purchase_order_id", sa.Uuid(), sa.ForeignKey("supplier_purchase_orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("event_id", sa.String(100), nullable=False),
        sa.Column("decision", sa.String(32), nullable=False),
        sa.Column("supplier_order_id", sa.String(180), nullable=True),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("supplier_id", "event_id", name="uq_supplier_confirmation_event"),
    )
    op.create_index("ix_supplier_confirmations_purchase_order_id", "supplier_confirmations", ["purchase_order_id"])


def downgrade() -> None:
    op.drop_index("ix_supplier_confirmations_purchase_order_id", table_name="supplier_confirmations")
    op.drop_table("supplier_confirmations")
    for name in ("order_item_id", "purchase_order_id"):
        op.drop_index(f"ix_supplier_purchase_order_items_{name}", table_name="supplier_purchase_order_items")
    op.drop_table("supplier_purchase_order_items")
    for name in ("next_attempt_at", "status", "supplier_id", "order_id", "po_number"):
        op.drop_index(f"ix_supplier_purchase_orders_{name}", table_name="supplier_purchase_orders")
    op.drop_table("supplier_purchase_orders")
    op.drop_index("ix_supplier_accounts_supplier_id", table_name="supplier_accounts")
    op.drop_table("supplier_accounts")
    op.drop_index("ix_orders_supplier_retry_at", table_name="orders")
    op.drop_column("orders", "supplier_retry_at")
    op.drop_column("orders", "supplier_retry_count")