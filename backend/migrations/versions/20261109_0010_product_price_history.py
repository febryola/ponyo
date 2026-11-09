"""Store product price history snapshots."""

from alembic import op
import sqlalchemy as sa

revision = "20261109_0010"
down_revision = "20261109_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("price_history", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.alter_column("products", "price_history", server_default=None)


def downgrade() -> None:
    op.drop_column("products", "price_history")
