"""Add customer profile addresses."""

from alembic import op
import sqlalchemy as sa

revision = "20261109_0003"
down_revision = "20261106_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_addresses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("address1", sa.String(length=240), nullable=False),
        sa.Column("address2", sa.String(length=240), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("region", sa.String(length=120), nullable=False),
        sa.Column("postal_code", sa.String(length=40), nullable=False),
        sa.Column("country_code", sa.String(length=2), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_customer_addresses_customer_id", "customer_addresses", ["customer_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_customer_addresses_customer_id", table_name="customer_addresses")
    op.drop_table("customer_addresses")