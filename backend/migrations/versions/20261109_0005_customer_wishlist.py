"""Add customer-owned wishlist items."""

from alembic import op
import sqlalchemy as sa

revision = "20261109_0005"
down_revision = "20261109_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wishlist_items",
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("customer_id", "product_id"),
    )


def downgrade() -> None:
    op.drop_table("wishlist_items")