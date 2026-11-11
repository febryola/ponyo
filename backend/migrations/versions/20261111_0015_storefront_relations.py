"""Add storefront relations without rebuilding existing SQLite tables."""

from alembic import op
import sqlalchemy as sa


revision = "20261111_0015"
down_revision = "20261111_0014"
branch_labels = None
depends_on = None


def _add_reference(table: str, column: str, target: str, ondelete: str) -> None:
    if op.get_context().dialect.name == "sqlite":
        # A nullable inline reference is additive even with foreign_keys enabled.
        # Do not use batch mode: rebuilding a referenced table can cascade deletes.
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN {column} CHAR(32) "
            f"REFERENCES {target}(id) ON DELETE {ondelete}"
        )
    else:
        op.add_column(table, sa.Column(column, sa.Uuid(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_{column}", table, target, [column], ["id"], ondelete=ondelete,
        )
    op.create_index(f"ix_{table}_{column}", table, [column], unique=False)


def _drop_reference(table: str, column: str) -> None:
    op.drop_index(f"ix_{table}_{column}", table_name=table)
    if op.get_context().dialect.name != "sqlite":
        op.drop_constraint(f"fk_{table}_{column}", table, type_="foreignkey")
    # SQLite 3.35+ can drop the inline reference with its column directly.
    op.drop_column(table, column)


def upgrade() -> None:
    op.create_table(
        "product_categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["product_categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "brands",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("contact_email", sa.String(length=320), nullable=True),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "product_images",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("alt", sa.Text(), server_default="", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "sort_order", name="uq_product_images_position"),
        sa.CheckConstraint("sort_order >= 0", name="ck_product_images_position"),
    )
    op.create_index("ix_product_images_product_id", "product_images", ["product_id"], unique=False)
    op.create_table(
        "supplier_offers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("variant_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_sku", sa.String(length=120), nullable=False),
        sa.Column("cost_amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("minimum_order_quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("lead_time_days", sa.Integer(), server_default="3", nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("supplier_id", "variant_id", name="uq_supplier_offers_variant"),
        sa.UniqueConstraint("supplier_id", "supplier_sku", name="uq_supplier_offers_sku"),
        sa.CheckConstraint("cost_amount >= 0", name="ck_supplier_offers_cost"),
        sa.CheckConstraint("minimum_order_quantity > 0", name="ck_supplier_offers_minimum"),
        sa.CheckConstraint("lead_time_days >= 0", name="ck_supplier_offers_lead_time"),
    )
    op.create_index("ix_supplier_offers_supplier_id", "supplier_offers", ["supplier_id"], unique=False)
    op.create_index("ix_supplier_offers_variant_id", "supplier_offers", ["variant_id"], unique=False)
    op.create_table(
        "supplier_inventory",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("offer_id", sa.Uuid(), nullable=False),
        sa.Column("on_hand", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reserved", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["offer_id"], ["supplier_offers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("offer_id"),
        sa.CheckConstraint("on_hand >= 0", name="ck_supplier_inventory_on_hand"),
        sa.CheckConstraint(
            "reserved >= 0 AND reserved <= on_hand", name="ck_supplier_inventory_reserved",
        ),
    )
    op.create_table(
        "shopping_carts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("guest_token_hash", sa.String(length=64), nullable=True),
        sa.Column("currency", sa.String(length=3), server_default="JPY", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("customer_id"),
        sa.UniqueConstraint("guest_token_hash"),
        sa.CheckConstraint(
            "(customer_id IS NOT NULL AND guest_token_hash IS NULL) OR "
            "(customer_id IS NULL AND guest_token_hash IS NOT NULL)",
            name="ck_shopping_carts_owner",
        ),
    )
    op.create_table(
        "cart_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("cart_id", sa.Uuid(), nullable=False),
        sa.Column("variant_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["cart_id"], ["shopping_carts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cart_id", "variant_id", name="uq_cart_items_variant"),
        sa.CheckConstraint("quantity > 0", name="ck_cart_items_quantity"),
    )
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"], unique=False)
    op.create_index("ix_cart_items_variant_id", "cart_items", ["variant_id"], unique=False)
    op.create_table(
        "order_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("from_status", sa.String(length=48), nullable=True),
        sa.Column("to_status", sa.String(length=48), nullable=False),
        sa.Column("payment_status", sa.String(length=48), nullable=False),
        sa.Column("fulfillment_status", sa.String(length=48), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("event_key", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", "event_key", name="uq_order_status_history_event"),
    )
    op.create_index(
        "ix_order_status_history_order_id", "order_status_history", ["order_id"], unique=False,
    )

    _add_reference("products", "category_id", "product_categories", "SET NULL")
    _add_reference("products", "brand_id", "brands", "SET NULL")
    _add_reference("order_items", "supplier_offer_id", "supplier_offers", "RESTRICT")


def downgrade() -> None:
    _drop_reference("order_items", "supplier_offer_id")
    _drop_reference("products", "brand_id")
    _drop_reference("products", "category_id")

    op.drop_index("ix_order_status_history_order_id", table_name="order_status_history")
    op.drop_table("order_status_history")
    op.drop_index("ix_cart_items_variant_id", table_name="cart_items")
    op.drop_index("ix_cart_items_cart_id", table_name="cart_items")
    op.drop_table("cart_items")
    op.drop_table("shopping_carts")
    op.drop_table("supplier_inventory")
    op.drop_index("ix_supplier_offers_variant_id", table_name="supplier_offers")
    op.drop_index("ix_supplier_offers_supplier_id", table_name="supplier_offers")
    op.drop_table("supplier_offers")
    op.drop_index("ix_product_images_product_id", table_name="product_images")
    op.drop_table("product_images")
    op.drop_table("suppliers")
    op.drop_table("brands")
    op.drop_table("product_categories")