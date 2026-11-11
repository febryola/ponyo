"""Add trusted account roles and revocable session versions without replacing accounts."""

from alembic import op
import sqlalchemy as sa


revision = "20261111_0016"
down_revision = "20261111_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Inline checks allow additive ALTER TABLE on both PostgreSQL and SQLite.
    op.add_column("customers", sa.Column(
        "role", sa.String(20),
        sa.CheckConstraint("role IN ('customer', 'supplier', 'admin')", name="ck_customers_role"),
        server_default="customer", nullable=False,
    ))
    op.add_column("customers", sa.Column(
        "auth_version", sa.Integer(),
        sa.CheckConstraint("auth_version >= 0", name="ck_customers_auth_version"),
        server_default="0", nullable=False,
    ))


def downgrade() -> None:
    op.drop_column("customers", "auth_version")
    op.drop_column("customers", "role")