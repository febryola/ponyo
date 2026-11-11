"""Add nullable provider reservation deadlines and supplier sync timestamps.

Revision ID: 20261111_0017
Revises: 20261111_0016
"""

from alembic import op
import sqlalchemy as sa

revision = "20261111_0017"
down_revision = "20261111_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("reservation_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("supplier_inventory", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_orders_reservation_expires_at", "orders", ["reservation_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_orders_reservation_expires_at", table_name="orders")
    op.drop_column("supplier_inventory", "last_synced_at")
    op.drop_column("orders", "reservation_expires_at")