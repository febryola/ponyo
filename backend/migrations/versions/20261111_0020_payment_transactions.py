"""Stripe authorization/capture/refund records and payment identities."""

from alembic import op
import sqlalchemy as sa

revision = "20261111_0020"
down_revision = "20261111_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True))
    op.create_index("ix_orders_stripe_payment_intent_id", "orders", ["stripe_payment_intent_id"], unique=True)
    op.add_column("orders", sa.Column("captured_amount", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("refunded_amount", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("capture_method", sa.String(16), nullable=False, server_default="automatic"))
    op.execute("UPDATE orders SET captured_amount = total_amount WHERE payment_status = 'paid'")
    op.create_table(
        "payment_transactions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("order_id", sa.Uuid(), sa.ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("provider_reference", sa.String(255), nullable=True),
        sa.Column("event_key", sa.String(255), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=True),
        sa.Column("reason", sa.String(64), nullable=True),
        sa.Column("error_code", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("event_key", name="uq_payment_transactions_event"),
        sa.UniqueConstraint("idempotency_key", name="uq_payment_transactions_idempotency"),
    )
    op.create_index("ix_payment_transactions_order_id", "payment_transactions", ["order_id"])
    op.create_index("ix_payment_transactions_provider_reference", "payment_transactions", ["provider_reference"])


def downgrade() -> None:
    op.drop_index("ix_payment_transactions_provider_reference", table_name="payment_transactions")
    op.drop_index("ix_payment_transactions_order_id", table_name="payment_transactions")
    op.drop_table("payment_transactions")
    op.drop_index("ix_orders_stripe_payment_intent_id", table_name="orders")
    for name in ("stripe_payment_intent_id", "captured_amount", "refunded_amount", "capture_method"):
        op.drop_column("orders", name)
