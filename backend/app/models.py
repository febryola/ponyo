from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Uuid, false, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_product_sku() -> str:
    return f"PNY-{uuid4().hex[:16].upper()}"


def new_variant_sku() -> str:
    return f"PNV-{uuid4().hex[:16].upper()}"


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        CheckConstraint("role IN ('customer', 'supplier', 'admin')", name="ck_customers_role"),
        CheckConstraint("auth_version >= 0", name="ck_customers_auth_version"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(120), default="")
    last_name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    role: Mapped[str] = mapped_column(String(20), default="customer", server_default="customer")
    auth_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    orders: Mapped[list[Order]] = relationship(back_populates="customer")


class CustomerAddress(Base):
    __tablename__ = "customer_addresses"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    first_name: Mapped[str] = mapped_column(String(120))
    last_name: Mapped[str] = mapped_column(String(120))
    address1: Mapped[str] = mapped_column(String(240))
    address2: Mapped[str] = mapped_column(String(240), default="")
    city: Mapped[str] = mapped_column(String(120))
    region: Mapped[str] = mapped_column(String(120), default="")
    postal_code: Mapped[str] = mapped_column(String(40))
    country_code: Mapped[str] = mapped_column(String(2))
    phone: Mapped[str] = mapped_column(String(40), default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ProductReview(Base):
    __tablename__ = "product_reviews"
    __table_args__ = (UniqueConstraint("product_id", "customer_id", name="uq_product_reviews_customer"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    reviewer_name: Mapped[str] = mapped_column(String(120))
    rating: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(140), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    photos: Mapped[list[str]] = mapped_column(JSON, default=list)
    verified_purchase: Mapped[bool] = mapped_column(Boolean, default=False)
    published: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ProductWaitlistEntry(Base):
    __tablename__ = "product_waitlist_entries"
    __table_args__ = (UniqueConstraint("product_id", "email", name="uq_product_waitlist_product_email"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    first_name: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    sku: Mapped[str] = mapped_column(String(120), unique=True, default=new_product_sku)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(240), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    price_amount: Mapped[int] = mapped_column(Integer)
    compare_at_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    availability: Mapped[str] = mapped_column(String(32), default="available")
    availability_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    price_history: Mapped[list[dict]] = mapped_column(JSON, default=list)
    category_id: Mapped[UUID | None] = mapped_column(ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    brand_id: Mapped[UUID | None] = mapped_column(ForeignKey("brands.id", ondelete="SET NULL"), nullable=True, index=True)
    category_name: Mapped[str] = mapped_column(String(100), default="Plushie")
    product_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    supplier_name: Mapped[str] = mapped_column(String(180), default="Ponyo")
    image_url: Mapped[str] = mapped_column(Text)
    image_alt: Mapped[str] = mapped_column(String(500), default="")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    size_tier: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dimensions: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dispatch_time: Mapped[str | None] = mapped_column(String(120), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    variants: Mapped[list[ProductVariant]] = relationship(back_populates="product", cascade="all, delete-orphan")
    category: Mapped[ProductCategory | None] = relationship()
    brand: Mapped[Brand | None] = relationship()
    images: Mapped[list[ProductImage]] = relationship(cascade="all, delete-orphan", order_by="ProductImage.sort_order")


class ProductTranslation(Base):
    __tablename__ = "product_translations"
    __table_args__ = (UniqueConstraint("product_id", "locale", name="uq_product_translations_product_locale"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    locale: Mapped[str] = mapped_column(String(12), index=True)
    source_hash: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AppTranslation(Base):
    __tablename__ = "app_translations"
    __table_args__ = (UniqueConstraint("locale", "translation_key", name="uq_app_translations_locale_key"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    locale: Mapped[str] = mapped_column(String(12), index=True)
    translation_key: Mapped[str] = mapped_column(String(160))
    source_hash: Mapped[str] = mapped_column(String(64))
    translated_text: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), default="Default")
    sku: Mapped[str] = mapped_column(String(120), unique=True, default=new_variant_sku)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    price_amount: Mapped[int] = mapped_column(Integer)
    compare_at_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    product: Mapped[Product] = relationship(back_populates="variants")


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("customer_id", "checkout_idempotency_key", name="uq_orders_customer_checkout_key"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    customer_id: Mapped[UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_email: Mapped[str] = mapped_column(String(320), index=True)
    status: Mapped[str] = mapped_column(String(48), default="pending_payment", index=True)
    payment_status: Mapped[str] = mapped_column(String(48), default="unpaid")
    fulfillment_status: Mapped[str] = mapped_column(String(48), default="unfulfilled")
    supplier_fulfillment_status: Mapped[str] = mapped_column(String(48), default="pending", server_default="pending")
    total_amount: Mapped[int] = mapped_column(Integer)
    subtotal_amount: Mapped[int] = mapped_column(Integer, default=0)
    discount_amount: Mapped[int] = mapped_column(Integer, default=0)
    shipping_amount: Mapped[int] = mapped_column(Integer, default=0)
    tax_amount: Mapped[int] = mapped_column(Integer, default=0)
    tax_rate_bps: Mapped[int] = mapped_column(Integer, default=0)
    coupon_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    shipping_address: Mapped[dict] = mapped_column(JSON)
    shipping_method: Mapped[str] = mapped_column(String(64))
    payment_method: Mapped[str] = mapped_column(String(32))
    payment_provider: Mapped[str] = mapped_column(String(32), default="stripe")
    stripe_session_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    checkout_idempotency_key: Mapped[str | None] = mapped_column(String(36), nullable=True)
    checkout_request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    checkout_request: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    captured_amount: Mapped[int] = mapped_column(Integer, default=0)
    refunded_amount: Mapped[int] = mapped_column(Integer, default=0)
    capture_method: Mapped[str] = mapped_column(String(16), default="automatic")
    supplier_retry_count: Mapped[int] = mapped_column(Integer, default=0)
    supplier_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    reservation_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    tracking_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tracking_carrier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    customer: Mapped[Customer | None] = relationship(back_populates="orders")
    items: Mapped[list[OrderItem]] = relationship(back_populates="order", cascade="all, delete-orphan")
    shipments: Mapped[list[Shipment]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[UUID] = mapped_column(ForeignKey("product_variants.id"))
    supplier_offer_id: Mapped[UUID | None] = mapped_column(ForeignKey("supplier_offers.id", ondelete="RESTRICT"), nullable=True, index=True)
    product_name: Mapped[str] = mapped_column(String(240))
    supplier_name: Mapped[str] = mapped_column(String(180), default="Ponyo")
    image_url: Mapped[str] = mapped_column(Text)
    image_alt: Mapped[str] = mapped_column(String(500), default="")
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    product_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    discount_amount: Mapped[int] = mapped_column(Integer, default=0)
    order: Mapped[Order] = relationship(back_populates="items")


class Shipment(Base):
    __tablename__ = "shipments"
    __table_args__ = (UniqueConstraint("carrier", "tracking_number", name="uq_shipments_carrier_tracking"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    shipment_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="label_created", index=True)
    carrier: Mapped[str] = mapped_column(String(120))
    tracking_number: Mapped[str] = mapped_column(String(180))
    tracking_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    estimated_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    customer_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    order: Mapped[Order] = relationship(back_populates="shipments")
    items: Mapped[list[ShipmentItem]] = relationship(cascade="all, delete-orphan")
    events: Mapped[list[ShipmentEvent]] = relationship(cascade="all, delete-orphan", order_by="ShipmentEvent.occurred_at")


class ShipmentItem(Base):
    __tablename__ = "shipment_items"
    __table_args__ = (UniqueConstraint("shipment_id", "order_item_id", name="uq_shipment_items_order_item"),
                      CheckConstraint("quantity > 0", name="ck_shipment_items_quantity"))

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    shipment_id: Mapped[UUID] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True)
    order_item_id: Mapped[UUID] = mapped_column(ForeignKey("order_items.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)


class ShipmentEvent(Base):
    __tablename__ = "shipment_events"
    __table_args__ = (UniqueConstraint("shipment_id", "event_key", name="uq_shipment_events_event_key"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    shipment_id: Mapped[UUID] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(24))
    event_key: Mapped[str] = mapped_column(String(180))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class Coupon(Base):
    __tablename__ = "coupons"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    discount_type: Mapped[str] = mapped_column(String(16))
    # Percentage coupons use basis points (1000 = 10%); fixed coupons use minor units.
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    minimum_subtotal: Mapped[int] = mapped_column(Integer, default=0)
    maximum_discount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_redemptions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    per_customer_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"
    __table_args__ = (UniqueConstraint("event_key", name="uq_payment_transactions_event"),
                     UniqueConstraint("idempotency_key", name="uq_payment_transactions_idempotency"))

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    provider: Mapped[str] = mapped_column(String(32), default="stripe")
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    provider_reference: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    event_key: Mapped[str] = mapped_column(String(255))
    idempotency_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class ProcessedWebhook(Base):
    __tablename__ = "processed_webhooks"

    event_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), default="stripe")
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class NewsletterSubscription(Base):
    __tablename__ = "newsletter_subscriptions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(24), default="subscribed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ContactRequest(Base):
    __tablename__ = "contact_requests"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(320), index=True)
    message: Mapped[str] = mapped_column(Text)
    request_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="received")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    event_type: Mapped[str] = mapped_column(String(120), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailNotification(Base):
    __tablename__ = "email_notifications"
    __table_args__ = (UniqueConstraint("notification_key", name="uq_email_notifications_key"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    outbox_event_id: Mapped[UUID] = mapped_column(ForeignKey("outbox_events.id", ondelete="RESTRICT"), index=True)
    notification_key: Mapped[str] = mapped_column(String(180))
    recipient: Mapped[str] = mapped_column(String(320))
    template: Mapped[str] = mapped_column(String(48))
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(180), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    parent_id: Mapped[UUID | None] = mapped_column(ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(180), unique=True)
    name: Mapped[str] = mapped_column(String(180))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(180))
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (
        UniqueConstraint("product_id", "sort_order", name="uq_product_images_position"),
        CheckConstraint("sort_order >= 0", name="ck_product_images_position"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(Text)
    alt: Mapped[str] = mapped_column(Text, default="", server_default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class SupplierOffer(Base):
    __tablename__ = "supplier_offers"
    __table_args__ = (
        UniqueConstraint("supplier_id", "variant_id", name="uq_supplier_offers_variant"),
        UniqueConstraint("supplier_id", "supplier_sku", name="uq_supplier_offers_sku"),
        CheckConstraint("cost_amount >= 0", name="ck_supplier_offers_cost"),
        CheckConstraint("minimum_order_quantity > 0", name="ck_supplier_offers_minimum"),
        CheckConstraint("lead_time_days >= 0", name="ck_supplier_offers_lead_time"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    supplier_id: Mapped[UUID] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    variant_id: Mapped[UUID] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"), index=True)
    supplier_sku: Mapped[str] = mapped_column(String(120))
    cost_amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    minimum_order_quantity: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    lead_time_days: Mapped[int] = mapped_column(Integer, default=3, server_default="3")
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    supplier: Mapped[Supplier] = relationship()
    variant: Mapped[ProductVariant] = relationship()
    inventory: Mapped[SupplierInventory | None] = relationship(back_populates="offer", cascade="all, delete-orphan", uselist=False)


class SupplierInventory(Base):
    __tablename__ = "supplier_inventory"
    __table_args__ = (
        CheckConstraint("on_hand >= 0", name="ck_supplier_inventory_on_hand"),
        CheckConstraint("reserved >= 0 AND reserved <= on_hand", name="ck_supplier_inventory_reserved"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    offer_id: Mapped[UUID] = mapped_column(ForeignKey("supplier_offers.id", ondelete="CASCADE"), unique=True)
    on_hand: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reserved: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    offer: Mapped[SupplierOffer] = relationship(back_populates="inventory")


class SupplierAccount(Base):
    __tablename__ = "supplier_accounts"

    customer_id: Mapped[UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True)
    supplier_id: Mapped[UUID] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)


class SupplierPurchaseOrder(Base):
    __tablename__ = "supplier_purchase_orders"
    __table_args__ = (UniqueConstraint("order_id", "supplier_id", "generation", name="uq_supplier_po_generation"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    po_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    supplier_id: Mapped[UUID] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    generation: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True)
    supplier_order_id: Mapped[str | None] = mapped_column(String(180), nullable=True)
    currency: Mapped[str] = mapped_column(String(3))
    total_cost: Mapped[int] = mapped_column(Integer)
    shipping_address: Mapped[dict] = mapped_column(JSON)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    items: Mapped[list[SupplierPurchaseOrderItem]] = relationship(cascade="all, delete-orphan")


class SupplierPurchaseOrderItem(Base):
    __tablename__ = "supplier_purchase_order_items"
    __table_args__ = (UniqueConstraint("order_item_id", "route_attempt", name="uq_supplier_po_item_route"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    purchase_order_id: Mapped[UUID] = mapped_column(ForeignKey("supplier_purchase_orders.id", ondelete="CASCADE"), index=True)
    order_item_id: Mapped[UUID] = mapped_column(ForeignKey("order_items.id", ondelete="RESTRICT"), index=True)
    offer_id: Mapped[UUID] = mapped_column(ForeignKey("supplier_offers.id", ondelete="RESTRICT"))
    route_attempt: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    supplier_sku: Mapped[str] = mapped_column(String(120))
    product_name: Mapped[str] = mapped_column(String(240))
    unit_cost: Mapped[int] = mapped_column(Integer)
    variant_id: Mapped[UUID] = mapped_column(ForeignKey("product_variants.id", ondelete="RESTRICT"))


class SupplierConfirmation(Base):
    __tablename__ = "supplier_confirmations"
    __table_args__ = (UniqueConstraint("supplier_id", "event_id", name="uq_supplier_confirmation_event"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    supplier_id: Mapped[UUID] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"))
    purchase_order_id: Mapped[UUID] = mapped_column(ForeignKey("supplier_purchase_orders.id", ondelete="RESTRICT"), index=True)
    event_id: Mapped[str] = mapped_column(String(100))
    decision: Mapped[str] = mapped_column(String(32))
    supplier_order_id: Mapped[str | None] = mapped_column(String(180), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ShoppingCart(Base):
    __tablename__ = "shopping_carts"
    __table_args__ = (
        CheckConstraint(
            "(customer_id IS NOT NULL AND guest_token_hash IS NULL) OR "
            "(customer_id IS NULL AND guest_token_hash IS NOT NULL)", name="ck_shopping_carts_owner",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    customer_id: Mapped[UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=True, unique=True)
    guest_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    currency: Mapped[str] = mapped_column(String(3), default="JPY", server_default="JPY")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    items: Mapped[list[CartItem]] = relationship(cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "variant_id", name="uq_cart_items_variant"),
        CheckConstraint("quantity > 0", name="ck_cart_items_quantity"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    cart_id: Mapped[UUID] = mapped_column(ForeignKey("shopping_carts.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[UUID] = mapped_column(ForeignKey("product_variants.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"
    __table_args__ = (UniqueConstraint("order_id", "event_key", name="uq_order_status_history_event"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(48), nullable=True)
    to_status: Mapped[str] = mapped_column(String(48))
    payment_status: Mapped[str] = mapped_column(String(48))
    fulfillment_status: Mapped[str] = mapped_column(String(48))
    source: Mapped[str] = mapped_column(String(40))
    event_key: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
