"""Add optional carrier tracking details to orders."""

from alembic import op
import sqlalchemy as sa

revision = "20261109_0011"
down_revision = "20261109_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("tracking_number", sa.String(length=120), nullable=True))
    op.add_column("orders", sa.Column("tracking_carrier", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "tracking_carrier")
    op.drop_column("orders", "tracking_number")
