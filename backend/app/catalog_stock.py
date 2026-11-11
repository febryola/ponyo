"""Public stock projections without exposing supplier costs or identities."""

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProductVariant, Supplier, SupplierInventory, SupplierOffer


def sellable_variant():
    has_offer = select(SupplierOffer.id).where(SupplierOffer.variant_id == ProductVariant.id).correlate(ProductVariant).exists()
    stocked_offer = select(SupplierOffer.id).join(
        SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id,
    ).join(Supplier, Supplier.id == SupplierOffer.supplier_id).where(
        SupplierOffer.variant_id == ProductVariant.id, SupplierOffer.active.is_(True),
        Supplier.active.is_(True), SupplierOffer.currency == ProductVariant.currency,
        SupplierInventory.on_hand > SupplierInventory.reserved,
    ).correlate(ProductVariant).exists()
    return and_(ProductVariant.active.is_(True), ProductVariant.stock_quantity > 0, or_(~has_offer, stocked_offer))


async def available_quantities(db: AsyncSession, variants) -> dict:
    variants = list(variants)
    if not variants:
        return {}
    ids = [variant.id for variant in variants]
    linked = set((await db.scalars(select(SupplierOffer.variant_id).where(SupplierOffer.variant_id.in_(ids)))).all())
    rows = (await db.execute(
        select(SupplierOffer.variant_id, func.max(SupplierInventory.on_hand - SupplierInventory.reserved))
        .join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
        .join(Supplier, Supplier.id == SupplierOffer.supplier_id)
        .join(ProductVariant, ProductVariant.id == SupplierOffer.variant_id)
        .where(SupplierOffer.variant_id.in_(ids), SupplierOffer.active.is_(True), Supplier.active.is_(True), SupplierOffer.currency == ProductVariant.currency)
        .group_by(SupplierOffer.variant_id)
    )).all()
    supplied = dict(rows)
    return {variant.id: max(0, min(variant.stock_quantity, supplied.get(variant.id, 0))) if variant.id in linked else max(0, variant.stock_quantity) for variant in variants if variant.active}