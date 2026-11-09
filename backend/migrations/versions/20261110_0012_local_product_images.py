"""Switch catalog and order images to Ponyo-hosted static assets."""

from alembic import op

revision = "20261110_0012"
down_revision = "20261109_0011"
branch_labels = None
depends_on = None


def _localize_images(table: str) -> None:
    op.execute(
        f"""
        UPDATE {table}
        SET image_url = '/images/catalog/' || regexp_replace(
            split_part(image_url, '?', 1),
            '^.*/',
            ''
        )
        WHERE image_url LIKE '%shopify.com/%'
        """
    )


def upgrade() -> None:
    _localize_images("products")
    _localize_images("order_items")


def downgrade() -> None:
    # Local paths must not be rewritten back to external reference URLs.
    pass
