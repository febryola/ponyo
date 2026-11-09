"""Persist selected option values for catalog variants."""

from alembic import op
import sqlalchemy as sa

revision = "20261109_0008"
down_revision = "20261109_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "product_variants",
        sa.Column("options", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.alter_column("product_variants", "options", server_default=None)
    op.execute("""
                UPDATE product_variants AS variant
                SET options = json_build_object(
                        'Size', product.size_tier,
                        'Color', CASE product.slug
                                WHEN 'hoshi-cloud-bear' THEN 'Cream'
                                WHEN 'haneul-bunny' THEN 'Cream'
                                WHEN 'mint-dino' THEN 'Mint green'
                                WHEN 'bluebell-penguin' THEN 'Blue and white'
                                WHEN 'hoshi-cloud-bear-xl' THEN 'Cream'
                                WHEN 'haneul-bunny-xl' THEN 'Cream'
                                WHEN 'baluran-elephant-xl' THEN 'Grey'
                                ELSE 'Default'
                        END
                )
                FROM products AS product
                WHERE product.id = variant.product_id
                    AND product.slug IN (
                        'hoshi-cloud-bear', 'haneul-bunny', 'mint-dino', 'bluebell-penguin',
                        'hoshi-cloud-bear-xl', 'haneul-bunny-xl', 'baluran-elephant-xl'
                    )
        """)


def downgrade() -> None:
    op.drop_column("product_variants", "options")
