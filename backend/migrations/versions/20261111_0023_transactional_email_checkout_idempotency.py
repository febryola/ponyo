"""Durable customer email delivery and checkout idempotency."""

from alembic import op
import sqlalchemy as sa

revision = "20261111_0023"
down_revision = "20261111_0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("checkout_idempotency_key", sa.String(length=36), nullable=True))
    op.add_column("orders", sa.Column("checkout_request_hash", sa.String(length=64), nullable=True))
    op.add_column("orders", sa.Column("checkout_request", sa.JSON(), nullable=True))
    op.create_unique_constraint(
        "uq_orders_customer_checkout_key", "orders", ["customer_id", "checkout_idempotency_key"],
    )
    op.create_table(
        "email_notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("outbox_event_id", sa.Uuid(), nullable=False),
        sa.Column("notification_key", sa.String(length=180), nullable=False),
        sa.Column("recipient", sa.String(length=320), nullable=False),
        sa.Column("template", sa.String(length=48), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["outbox_event_id"], ["outbox_events.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("notification_key", name="uq_email_notifications_key"),
    )
    for name in ("outbox_event_id", "status", "next_attempt_at"):
        op.create_index(f"ix_email_notifications_{name}", "email_notifications", [name])


def downgrade() -> None:
    for name in ("next_attempt_at", "status", "outbox_event_id"):
        op.drop_index(f"ix_email_notifications_{name}", table_name="email_notifications")
    op.drop_table("email_notifications")
    op.drop_constraint("uq_orders_customer_checkout_key", "orders", type_="unique")
    op.drop_column("orders", "checkout_request")
    op.drop_column("orders", "checkout_request_hash")
    op.drop_column("orders", "checkout_idempotency_key")
