"""Add product reviews and launch waitlist entries."""

from alembic import op
import sqlalchemy as sa

revision = "20261109_0007"
down_revision = "20261109_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_reviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("reviewer_name", sa.String(length=120), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=140), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("verified_purchase", sa.Boolean(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "customer_id", name="uq_product_reviews_customer"),
    )
    op.create_index("ix_product_reviews_customer_id", "product_reviews", ["customer_id"], unique=False)
    op.create_index("ix_product_reviews_product_id", "product_reviews", ["product_id"], unique=False)
    op.create_index("ix_product_reviews_published", "product_reviews", ["published"], unique=False)

    op.create_table(
        "product_waitlist_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "email", name="uq_product_waitlist_product_email"),
    )
    op.create_index("ix_product_waitlist_entries_customer_id", "product_waitlist_entries", ["customer_id"], unique=False)
    op.create_index("ix_product_waitlist_entries_email", "product_waitlist_entries", ["email"], unique=False)
    op.create_index("ix_product_waitlist_entries_product_id", "product_waitlist_entries", ["product_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_product_waitlist_entries_product_id", table_name="product_waitlist_entries")
    op.drop_index("ix_product_waitlist_entries_email", table_name="product_waitlist_entries")
    op.drop_index("ix_product_waitlist_entries_customer_id", table_name="product_waitlist_entries")
    op.drop_table("product_waitlist_entries")
    op.drop_index("ix_product_reviews_published", table_name="product_reviews")
    op.drop_index("ix_product_reviews_product_id", table_name="product_reviews")
    op.drop_index("ix_product_reviews_customer_id", table_name="product_reviews")
    op.drop_table("product_reviews")
