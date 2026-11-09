"""Store optional optimized review photos."""

from alembic import op
import sqlalchemy as sa

revision = "20261109_0009"
down_revision = "20261109_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "product_reviews",
        sa.Column("photos", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.alter_column("product_reviews", "photos", server_default=None)


def downgrade() -> None:
    op.drop_column("product_reviews", "photos")
