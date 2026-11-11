"""Order pricing breakdowns, immutable item snapshots, and merchant coupons."""

from alembic import op
import sqlalchemy as sa

revision = "20261111_0019"
down_revision = "20261111_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("subtotal_amount", "discount_amount", "shipping_amount", "tax_amount", "tax_rate_bps"):
        op.add_column("orders", sa.Column(name, sa.Integer(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("coupon_code", sa.String(64), nullable=True))
    op.add_column("orders", sa.Column("cancellation_reason", sa.String(500), nullable=True))
    op.create_index("ix_orders_coupon_code", "orders", ["coupon_code"])
    op.add_column("order_items", sa.Column("product_snapshot", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("order_items", sa.Column("discount_amount", sa.Integer(), nullable=False, server_default="0"))
    # Old orders have no historic tax/shipping breakdown: infer only what item snapshots prove.
    op.execute("UPDATE orders SET subtotal_amount = COALESCE((SELECT SUM(quantity * unit_price) FROM order_items WHERE order_items.order_id = orders.id), total_amount)")
    op.execute("UPDATE orders SET shipping_amount = CASE WHEN total_amount > subtotal_amount THEN total_amount - subtotal_amount ELSE 0 END")
    op.create_table(
        "coupons",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("discount_type", sa.String(16), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("minimum_subtotal", sa.Integer(), nullable=False),
        sa.Column("maximum_discount", sa.Integer(), nullable=True),
        sa.Column("max_redemptions", sa.Integer(), nullable=True),
        sa.Column("per_customer_limit", sa.Integer(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_coupons_code", "coupons", ["code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_coupons_code", table_name="coupons")
    op.drop_table("coupons")
    for name in ("product_snapshot", "discount_amount"):
        op.drop_column("order_items", name)
    op.drop_index("ix_orders_coupon_code", table_name="orders")
    for name in ("subtotal_amount", "discount_amount", "shipping_amount", "tax_amount", "tax_rate_bps", "coupon_code", "cancellation_reason"):
        op.drop_column("orders", name)
