"""Add cached product translations."""

from alembic import op
import sqlalchemy as sa


revision = "20261111_0013"
down_revision = "20261110_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_translations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("locale", sa.String(length=12), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "locale", name="uq_product_translations_product_locale"),
    )
    op.create_index("ix_product_translations_product_id", "product_translations", ["product_id"])
    op.create_index("ix_product_translations_locale", "product_translations", ["locale"])


def downgrade() -> None:
    op.drop_index("ix_product_translations_locale", table_name="product_translations")
    op.drop_index("ix_product_translations_product_id", table_name="product_translations")
    op.drop_table("product_translations")