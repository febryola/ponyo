from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(120), default="")
    last_name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    orders: Mapped[list[Order]] = relationship(back_populates="customer")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(240), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    price_amount: Mapped[int] = mapped_column(Integer)
    compare_at_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    availability: Mapped[str] = mapped_column(String(32), default="available")
    availability_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
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


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    product_id: Mapped[UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120), default="Default")
    sku: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    price_amount: Mapped[int] = mapped_column(Integer)
    compare_at_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    product: Mapped[Product] = relationship(back_populates="variants")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    customer_id: Mapped[UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_email: Mapped[str] = mapped_column(String(320), index=True)
    status: Mapped[str] = mapped_column(String(48), default="pending_payment", index=True)
    payment_status: Mapped[str] = mapped_column(String(48), default="unpaid")
    fulfillment_status: Mapped[str] = mapped_column(String(48), default="unfulfilled")
    total_amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    shipping_address: Mapped[dict] = mapped_column(JSON)
    shipping_method: Mapped[str] = mapped_column(String(64))
    payment_method: Mapped[str] = mapped_column(String(32))
    payment_provider: Mapped[str] = mapped_column(String(32), default="stripe")
    stripe_session_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    customer: Mapped[Customer | None] = relationship(back_populates="orders")
    items: Mapped[list[OrderItem]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[UUID] = mapped_column(ForeignKey("product_variants.id"))
    product_name: Mapped[str] = mapped_column(String(240))
    supplier_name: Mapped[str] = mapped_column(String(180), default="Ponyo")
    image_url: Mapped[str] = mapped_column(Text)
    image_alt: Mapped[str] = mapped_column(String(500), default="")
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="JPY")
    order: Mapped[Order] = relationship(back_populates="items")


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
