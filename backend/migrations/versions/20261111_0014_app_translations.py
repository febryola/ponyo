"""Cache AWS translations for storefront UI copy."""

from alembic import op
import sqlalchemy as sa

revision = "20261111_0014"
down_revision = "20261111_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_translations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("locale", sa.String(length=12), nullable=False),
        sa.Column("translation_key", sa.String(length=160), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("locale", "translation_key", name="uq_app_translations_locale_key"),
    )
    op.create_index("ix_app_translations_locale", "app_translations", ["locale"])


def downgrade() -> None:
    op.drop_index("ix_app_translations_locale", table_name="app_translations")
    op.drop_table("app_translations")