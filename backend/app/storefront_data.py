"""Development-only linked catalog fixtures; no real supplier partnerships implied."""

import re
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import (
    Brand, Order, OrderStatusHistory, Product, ProductCategory, ProductImage,
    Supplier, SupplierInventory, SupplierOffer,
)


def demo_id(kind: str, key: str):
    return uuid5(NAMESPACE_URL, f"https://ponyo.example/demo/{kind}/{key}")


def catalog_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:140] or f"catalog-{demo_id('name', name).hex[:16]}"


async def link_demo_catalog(db: AsyncSession) -> None:
    """Backfill missing links only. Never replenish stock or overwrite supplier edits."""
    if settings.environment == "production":
        raise RuntimeError("Demo supplier data must not be created in production.")
    products = (await db.scalars(select(Product).options(selectinload(Product.variants)))).all()
    for product in products:
        if product.category_id is None:
            slug = catalog_slug(product.category_name)
            category = await db.scalar(select(ProductCategory).where(ProductCategory.slug == slug))
            if category is None:
                category = ProductCategory(id=demo_id("category", slug), slug=slug, name=product.category_name)
                db.add(category)
                await db.flush()
            product.category_id = category.id
        if product.brand_id is None:
            slug = catalog_slug(product.supplier_name)
            brand = await db.scalar(select(Brand).where(Brand.slug == slug))
            if brand is None:
                brand = Brand(id=demo_id("brand", slug), slug=slug, name=product.supplier_name, is_demo=True)
                db.add(brand)
                await db.flush()
            product.brand_id = brand.id
        if not await db.scalar(select(ProductImage.id).where(ProductImage.product_id == product.id)):
            db.add(ProductImage(id=demo_id("image", str(product.id)), product_id=product.id, url=product.image_url, alt=product.image_alt, sort_order=0))
        # A manufacturer/brand is not a supplier business. Use explicitly fictional wholesalers.
        code = "DEMO-XL" if "domina" in product.supplier_name.lower() else "DEMO-PLUSH"
        supplier = await db.scalar(select(Supplier).where(Supplier.code == code))
        if supplier is None:
            supplier = Supplier(
                id=demo_id("supplier", code), code=code,
                name="Demo Giant Plush Wholesale" if code == "DEMO-XL" else "Demo Cuddle Supply",
                contact_email=f"{code.lower()}@suppliers.example", is_demo=True,
            )
            db.add(supplier)
            await db.flush()
        for variant in product.variants:
            # Do not invent another offer for a variant already supplied by someone.
            offer = await db.scalar(select(SupplierOffer).where(SupplierOffer.variant_id == variant.id).order_by(SupplierOffer.id))
            if offer is None:
                offer = SupplierOffer(
                    id=demo_id("offer", str(variant.id)), supplier_id=supplier.id,
                    variant_id=variant.id, supplier_sku=f"DEMO-{variant.id.hex[:24].upper()}",
                    cost_amount=max(0, variant.price_amount * 60 // 100), currency=variant.currency,
                )
                db.add(offer)
                await db.flush()
            if not await db.scalar(select(SupplierInventory.id).where(SupplierInventory.offer_id == offer.id)):
                db.add(SupplierInventory(
                    id=demo_id("inventory", str(offer.id)), offer_id=offer.id,
                    on_hand=max(0, variant.stock_quantity), reserved=0,
                ))
    for order in (await db.scalars(select(Order))).all():
        if not await db.scalar(select(OrderStatusHistory.id).where(OrderStatusHistory.order_id == order.id)):
            db.add(OrderStatusHistory(
                id=demo_id("order-history", str(order.id)), order_id=order.id,
                to_status=order.status, payment_status=order.payment_status,
                fulfillment_status=order.fulfillment_status, source="legacy_snapshot",
                event_key="legacy_snapshot", created_at=order.updated_at,
            ))
    await db.flush()