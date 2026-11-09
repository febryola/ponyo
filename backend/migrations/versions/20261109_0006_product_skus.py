"""Assign unique product and variant SKUs."""

from alembic import op
import sqlalchemy as sa

revision = "20261109_0006"
down_revision = "20261109_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("sku", sa.String(length=120), nullable=True))
    op.execute(
        "UPDATE products SET sku = 'PNY-' || upper(substr(replace(id::text, '-', ''), 1, 16)) WHERE sku IS NULL"
    )
    op.alter_column("products", "sku", existing_type=sa.String(length=120), nullable=False)
    op.create_unique_constraint("uq_products_sku", "products", ["sku"])

    op.execute(
        "UPDATE product_variants SET sku = 'PNV-' || upper(substr(replace(id::text, '-', ''), 1, 16)) WHERE sku IS NULL"
    )
    op.alter_column("product_variants", "sku", existing_type=sa.String(length=120), nullable=False)


def downgrade() -> None:
    op.alter_column("product_variants", "sku", existing_type=sa.String(length=120), nullable=True)
    op.drop_constraint("uq_products_sku", "products", type_="unique")
    op.drop_column("products", "sku")
