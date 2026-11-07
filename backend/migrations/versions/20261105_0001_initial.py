"""Initial Ponyo catalog, accounts, orders, and storefront form tables."""

from alembic import op
import sqlalchemy as sa

revision = "20261105_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("marketing_opt_in", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_customers_email", "customers", ["email"], unique=True)

    op.create_table(
        "products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("name", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("price_amount", sa.Integer(), nullable=False),
        sa.Column("compare_at_amount", sa.Integer(), nullable=True),
        sa.Column("availability", sa.String(length=32), nullable=False),
        sa.Column("availability_status", sa.String(length=32), nullable=True),
        sa.Column("category_name", sa.String(length=100), nullable=False),
        sa.Column("product_type", sa.String(length=100), nullable=True),
        sa.Column("supplier_name", sa.String(length=180), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("image_alt", sa.String(length=500), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("size_tier", sa.String(length=40), nullable=True),
        sa.Column("dimensions", sa.String(length=80), nullable=True),
        sa.Column("dispatch_time", sa.String(length=120), nullable=True),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_products_slug", "products", ["slug"], unique=True)
    op.create_index("ix_products_name", "products", ["name"], unique=False)
    op.create_index("ix_products_published", "products", ["published"], unique=False)

    op.create_table(
        "newsletter_subscriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_newsletter_subscriptions_email", "newsletter_subscriptions", ["email"], unique=True)

    op.create_table(
        "contact_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("request_type", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contact_requests_email", "contact_requests", ["email"], unique=False)

    op.create_table(
        "orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_number", sa.String(length=32), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("customer_email", sa.String(length=320), nullable=False),
        sa.Column("status", sa.String(length=48), nullable=False),
        sa.Column("payment_status", sa.String(length=48), nullable=False),
        sa.Column("fulfillment_status", sa.String(length=48), nullable=False),
        sa.Column("total_amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("shipping_address", sa.JSON(), nullable=False),
        sa.Column("shipping_method", sa.String(length=64), nullable=False),
        sa.Column("payment_method", sa.String(length=32), nullable=False),
        sa.Column("payment_provider", sa.String(length=32), nullable=False),
        sa.Column("stripe_session_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_number"),
        sa.UniqueConstraint("stripe_session_id"),
    )
    op.create_index("ix_orders_customer_id", "orders", ["customer_id"], unique=False)
    op.create_index("ix_orders_customer_email", "orders", ["customer_email"], unique=False)
    op.create_index("ix_orders_created_at", "orders", ["created_at"], unique=False)
    op.create_index("ix_orders_order_number", "orders", ["order_number"], unique=True)
    op.create_index("ix_orders_status", "orders", ["status"], unique=False)

    op.create_table(
        "product_variants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("sku", sa.String(length=120), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("price_amount", sa.Integer(), nullable=False),
        sa.Column("compare_at_amount", sa.Integer(), nullable=True),
        sa.Column("stock_quantity", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku"),
    )
    op.create_index("ix_product_variants_product_id", "product_variants", ["product_id"], unique=False)

    op.create_table(
        "order_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("variant_id", sa.Uuid(), nullable=False),
        sa.Column("product_name", sa.String(length=240), nullable=False),
        sa.Column("supplier_name", sa.String(length=180), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("image_alt", sa.String(length=500), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"], unique=False)

    op.create_table(
        "processed_webhooks",
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("event_id"),
    )


def downgrade() -> None:
    op.drop_table("processed_webhooks")
    op.drop_index("ix_order_items_order_id", table_name="order_items")
    op.drop_table("order_items")
    op.drop_index("ix_product_variants_product_id", table_name="product_variants")
    op.drop_table("product_variants")
    for name in ("ix_orders_status", "ix_orders_order_number", "ix_orders_created_at", "ix_orders_customer_email", "ix_orders_customer_id"):
        op.drop_index(name, table_name="orders")
    op.drop_table("orders")
    op.drop_index("ix_contact_requests_email", table_name="contact_requests")
    op.drop_table("contact_requests")
    op.drop_index("ix_newsletter_subscriptions_email", table_name="newsletter_subscriptions")
    op.drop_table("newsletter_subscriptions")
    for name in ("ix_products_published", "ix_products_name", "ix_products_slug"):
        op.drop_index(name, table_name="products")
    op.drop_table("products")
    op.drop_index("ix_customers_email", table_name="customers")
    op.drop_table("customers")
