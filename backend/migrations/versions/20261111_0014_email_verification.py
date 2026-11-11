"""Add customer email verification and expiring verification tokens."""

from alembic import op
import sqlalchemy as sa


revision = "20261111_0014"
down_revision = "20261111_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing accounts must verify their email too.
    op.add_column(
        "customers",
        sa.Column("email_verified", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index("ix_customers_email_verified", "customers", ["email_verified"], unique=False)
    op.create_table(
        "email_verification_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_verification_tokens_customer_id", "email_verification_tokens", ["customer_id"], unique=False,
    )
    op.create_index(
        "ix_email_verification_tokens_token_hash", "email_verification_tokens", ["token_hash"], unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_email_verification_tokens_token_hash", table_name="email_verification_tokens")
    op.drop_index("ix_email_verification_tokens_customer_id", table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")
    op.drop_index("ix_customers_email_verified", table_name="customers")
    op.drop_column("customers", "email_verified")