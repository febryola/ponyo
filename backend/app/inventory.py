"""Transactional supplier reservations, with a legacy-stock fallback for unlinked items."""

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OrderItem, ProductVariant, Supplier, SupplierInventory, SupplierOffer


async def refresh_synced_variant(db: AsyncSession, variant_id) -> None:
    quantity = await db.scalar(select(func.max(SupplierInventory.on_hand - SupplierInventory.reserved))
        .join(SupplierOffer, SupplierOffer.id == SupplierInventory.offer_id)
        .join(Supplier, Supplier.id == SupplierOffer.supplier_id)
        .join(ProductVariant, ProductVariant.id == SupplierOffer.variant_id)
        .where(SupplierOffer.variant_id == variant_id, SupplierOffer.active.is_(True),
               Supplier.active.is_(True), SupplierOffer.currency == ProductVariant.currency))
    await db.execute(update(ProductVariant).where(ProductVariant.id == variant_id).values(
        stock_quantity=max(0, quantity or 0),
    ).execution_options(synchronize_session=False))


async def has_synced_inventory(db: AsyncSession, variant_id) -> bool:
    return await db.scalar(select(SupplierInventory.id).join(
        SupplierOffer, SupplierOffer.id == SupplierInventory.offer_id,
    ).where(SupplierOffer.variant_id == variant_id, SupplierInventory.last_synced_at.is_not(None)).limit(1)) is not None


async def restore_variant_stock(db: AsyncSession, item: OrderItem) -> None:
    if await has_synced_inventory(db, item.variant_id):
        await refresh_synced_variant(db, item.variant_id)
    else:
        await db.execute(update(ProductVariant).where(ProductVariant.id == item.variant_id).values(
            stock_quantity=ProductVariant.stock_quantity + item.quantity,
        ).execution_options(synchronize_session=False))


async def reserve_supplier_stock(db: AsyncSession, variant: ProductVariant, quantity: int):
    has_offers = await db.scalar(select(SupplierOffer.id).where(SupplierOffer.variant_id == variant.id).limit(1))
    if not has_offers:
        return None  # Existing imports remain purchasable until their supply is linked.
    candidates = (await db.execute(
        select(SupplierOffer, SupplierInventory)
        .join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
        .join(Supplier, Supplier.id == SupplierOffer.supplier_id)
        .where(
            SupplierOffer.variant_id == variant.id, SupplierOffer.active.is_(True),
            Supplier.active.is_(True), SupplierOffer.currency == variant.currency,
            SupplierInventory.on_hand - SupplierInventory.reserved >= quantity,
        )
        .order_by(SupplierOffer.lead_time_days, SupplierOffer.id)
        .with_for_update()
    )).all()
    for offer, inventory in candidates:
        result = await db.execute(
            update(SupplierInventory).where(
                SupplierInventory.id == inventory.id,
                SupplierInventory.on_hand - SupplierInventory.reserved >= quantity,
            ).values(reserved=SupplierInventory.reserved + quantity)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount == 1:
            return offer.id
    raise HTTPException(409, "One or more items no longer have supplier stock available.")


async def settle_supplier_stock(db: AsyncSession, item: OrderItem, *, paid: bool) -> None:
    if item.supplier_offer_id is None:
        return
    values = {"reserved": SupplierInventory.reserved - item.quantity}
    if paid:
        values["on_hand"] = SupplierInventory.on_hand - item.quantity
    result = await db.execute(
        update(SupplierInventory).where(
            SupplierInventory.offer_id == item.supplier_offer_id,
            SupplierInventory.reserved >= item.quantity,
        ).values(**values).execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise HTTPException(409, "Supplier reservation is not available for this order.")
    if paid and await has_synced_inventory(db, item.variant_id):
        await refresh_synced_variant(db, item.variant_id)