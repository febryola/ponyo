"""Durable supplier order planning and explicit confirmation transitions.

Callers lock Order first, then purchase order/variants/offers. Paid source stock
has already been settled by payments; only an alternative is debited here.
A transport timeout is NEVER evidence that a supplier rejected the PO.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.inventory import has_synced_inventory, refresh_synced_variant
from app.models import (Order, OrderItem, OrderStatusHistory, OutboxEvent, ProductVariant, Supplier,
                        SupplierConfirmation, SupplierInventory, SupplierOffer,
                        SupplierPurchaseOrder, SupplierPurchaseOrderItem)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def retry_delay(attempt: int) -> timedelta:
    return timedelta(seconds=min(3600, settings.supplier_retry_base_seconds * 2 ** max(0, attempt - 1)))


def purchase_order_payload(po: SupplierPurchaseOrder, *, forwarding: bool = False) -> dict:
    data = {"id": str(po.id), "purchaseOrderNumber": po.po_number, "orderId": str(po.order_id),
            "supplierId": str(po.supplier_id), "status": po.status, "generation": po.generation,
            "supplierOrderId": po.supplier_order_id, "currency": po.currency, "totalCost": po.total_cost,
            "attempts": po.attempts, "lastError": po.last_error, "rejectionReason": po.rejection_reason,
            "nextAttemptAt": po.next_attempt_at.isoformat() if po.next_attempt_at else None,
            "createdAt": po.created_at.isoformat(),
            "items": [{"id": str(item.id), "orderItemId": str(item.order_item_id),
                       "variantId": str(item.variant_id), "supplierSku": item.supplier_sku,
                       "productName": item.product_name, "quantity": item.quantity,
                       "unitCost": item.unit_cost, "routeAttempt": item.route_attempt} for item in sorted(po.items, key=lambda value: value.id)]}
    if forwarding:
        # A provider may compare the entire request on idempotency replay.
        # Never include mutable attempts/status/timestamps in a resend payload.
        data = {key: data[key] for key in ("id", "purchaseOrderNumber", "orderId", "supplierId", "generation", "currency", "totalCost", "items")}
        data.update(idempotencyKey=po.idempotency_key, shippingAddress=po.shipping_address)
    return data


async def order_allocations(db: AsyncSession, order: Order):
    return (await db.execute(select(SupplierPurchaseOrderItem, SupplierPurchaseOrder)
                             .join(SupplierPurchaseOrder, SupplierPurchaseOrder.id == SupplierPurchaseOrderItem.purchase_order_id)
                             .where(SupplierPurchaseOrder.order_id == order.id)
                             .order_by(SupplierPurchaseOrderItem.route_attempt))).all()


async def refresh_fulfillment(db: AsyncSession, order: Order) -> None:
    rows = await order_allocations(db, order)
    latest = {item.order_item_id: po for item, po in rows}
    if not order.items:
        return
    if any(item.id not in latest or latest[item.id].status in {"rejected", "manual_review"} for item in order.items):
        value = "on_hold"
    elif all(latest[item.id].status == "confirmed" for item in order.items):
        value = "supplier_confirmed"
    else:
        value = "queued"
    order.supplier_fulfillment_status = value
    if order.fulfillment_status != value and order.fulfillment_status in {"unfulfilled", "queued", "on_hold", "supplier_confirmed"}:
        order.fulfillment_status = value
        db.add(OrderStatusHistory(order_id=order.id, from_status=order.status, to_status=order.status,
                                  payment_status=order.payment_status, fulfillment_status=value,
                                  source="supplier_routing", event_key=f"supplier-state:{uuid4()}"))


async def select_alternative(db: AsyncSession, item: OrderItem, excluded_suppliers: set[UUID], max_cost: int | None):
    variant = await db.scalar(select(ProductVariant).where(ProductVariant.id == item.variant_id).with_for_update())
    if not variant or not variant.active:
        return None
    if variant.currency.upper() != item.product_snapshot.get("sourceCurrency", item.currency).upper():
        return None  # Do not compare supplier costs across unconverted currencies.
    query = (select(SupplierOffer).join(Supplier, Supplier.id == SupplierOffer.supplier_id)
             .join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
             .where(SupplierOffer.variant_id == item.variant_id, SupplierOffer.active.is_(True), Supplier.active.is_(True),
                    SupplierOffer.currency == variant.currency, SupplierOffer.minimum_order_quantity <= item.quantity,
                    SupplierInventory.on_hand - SupplierInventory.reserved >= item.quantity)
             .order_by(SupplierOffer.lead_time_days, SupplierOffer.cost_amount, SupplierOffer.id).with_for_update())
    if excluded_suppliers:
        query = query.where(SupplierOffer.supplier_id.not_in(excluded_suppliers))
    if settings.environment == "production":
        query = query.where(Supplier.is_demo.is_(False))
    if max_cost is not None:
        query = query.where(SupplierOffer.cost_amount <= max_cost)
    for offer in await db.scalars(query):
        result = await db.execute(update(SupplierInventory).where(
            SupplierInventory.offer_id == offer.id,
            SupplierInventory.on_hand - SupplierInventory.reserved >= item.quantity,
        ).values(on_hand=SupplierInventory.on_hand - item.quantity).execution_options(synchronize_session=False))
        if result.rowcount == 1:
            if await has_synced_inventory(db, item.variant_id):
                await refresh_synced_variant(db, item.variant_id)
            return offer
    return None


async def generate_purchase_orders(db: AsyncSession, order: Order) -> list[SupplierPurchaseOrder]:
    """Idempotent planning for a paid order. No network calls, no duplicate primary debit."""
    if order.payment_status != "paid" or order.status != "processing":
        raise HTTPException(409, "Only paid processing orders can be routed to suppliers.")
    await db.flush()  # Ensure new order items have their immutable identifiers.
    allocations = await order_allocations(db, order)
    latest = {item.order_item_id: (item, po) for item, po in allocations}
    supplier_attempts: dict[UUID, set[UUID]] = defaultdict(set)
    baseline_cost: dict[UUID, int] = {}
    for item, po in allocations:
        supplier_attempts[item.order_item_id].add(po.supplier_id)
        baseline_cost.setdefault(item.order_item_id, item.unit_cost)
    groups: dict[UUID, list[tuple[OrderItem, SupplierOffer, int]]] = defaultdict(list)
    unresolved = False
    for item in sorted(order.items, key=lambda value: value.variant_id):
        previous = latest.get(item.id)
        if previous and previous[1].status != "rejected":
            continue  # Submitted/unknown/manual-review must never route to another supplier.
        attempt = previous[0].route_attempt + 1 if previous else 1
        if attempt > settings.supplier_max_attempts:
            unresolved = True
            continue
        offer = None
        if previous is None and item.supplier_offer_id:
            # This exact quantity was already deducted during payment settlement.
            offer = await db.scalar(select(SupplierOffer).join(Supplier, Supplier.id == SupplierOffer.supplier_id).where(
                SupplierOffer.id == item.supplier_offer_id, SupplierOffer.active.is_(True), Supplier.active.is_(True),
                SupplierOffer.minimum_order_quantity <= item.quantity,
                SupplierOffer.currency == item.product_snapshot.get("sourceCurrency", item.currency),
            ))
            if offer and settings.environment == "production" and (await db.get(Supplier, offer.supplier_id)).is_demo:
                offer = None
            if offer is None:
                original = await db.get(SupplierOffer, item.supplier_offer_id)
                if original:
                    supplier_attempts[item.id].add(original.supplier_id)
                    baseline_cost[item.id] = original.cost_amount
        if offer is None:
            # Never silently accept a higher supplier cost than the first allocation;
            # an unlinked legacy item is capped at its source catalog unit price.
            max_cost = baseline_cost.get(item.id, item.product_snapshot.get("sourceUnitPrice", item.unit_price))
            offer = await select_alternative(db, item, supplier_attempts[item.id], max_cost)
        if offer is None:
            unresolved = True
            continue
        groups[offer.supplier_id].append((item, offer, attempt))

    created = []
    for supplier_id in sorted(groups):
        group = groups[supplier_id]
        # Different retry waves for one supplier remain distinct immutable POs.
        generation = max((po.generation for _, po in allocations if po.supplier_id == supplier_id), default=0) + 1
        identifier = uuid4()
        currency = group[0][1].currency
        if any(offer.currency != currency for _, offer, _ in group):
            raise HTTPException(409, "Supplier purchase orders cannot contain mixed cost currencies.")
        po = SupplierPurchaseOrder(id=identifier, po_number=f"PPO-{now_utc():%y%m%d}-{identifier.hex[:20].upper()}",
                                   order_id=order.id, supplier_id=supplier_id, generation=generation,
                                   status="pending", idempotency_key=f"ponyo-po-{identifier}", currency=currency,
                                   total_cost=sum(offer.cost_amount * item.quantity for item, offer, _ in group),
                                   shipping_address=dict(order.shipping_address), next_attempt_at=now_utc())
        for item, offer, attempt in group:
            po.items.append(SupplierPurchaseOrderItem(order_item_id=item.id, offer_id=offer.id, route_attempt=attempt,
                                                       quantity=item.quantity, supplier_sku=offer.supplier_sku,
                                                       product_name=item.product_name, unit_cost=offer.cost_amount,
                                                       variant_id=item.variant_id))
        db.add(po)
        created.append(po)
    await db.flush()
    await refresh_fulfillment(db, order)
    if unresolved:
        order.supplier_retry_count += 1
        order.supplier_retry_at = (now_utc() + retry_delay(order.supplier_retry_count)
                                   if order.supplier_retry_count < settings.supplier_max_attempts else None)
        if order.supplier_retry_count == 1 or order.supplier_retry_at is None:
            db.add(OutboxEvent(event_type="supplier.routing_required", payload={"orderId": str(order.id)}))
    else:
        order.supplier_retry_at = None
    return created


async def confirm_purchase_order(db: AsyncSession, order: Order, po: SupplierPurchaseOrder, *, event_id: str,
                                  decision: str, supplier_order_id: str | None, reason: str | None = None):
    if decision not in {"confirmed", "rejected"}:
        raise HTTPException(422, "Choose confirmed or rejected.")
    previous_event = await db.scalar(select(SupplierConfirmation).where(
        SupplierConfirmation.supplier_id == po.supplier_id, SupplierConfirmation.event_id == event_id,
    ))
    if previous_event:
        if (previous_event.purchase_order_id != po.id or previous_event.decision != decision
                or previous_event.supplier_order_id != supplier_order_id or previous_event.reason != reason):
            raise HTTPException(409, "Confirmation event ID was already used with different data.")
        return po
    if po.status in {"confirmed", "rejected"}:
        if po.status != decision or (po.supplier_order_id and supplier_order_id != po.supplier_order_id):
            raise HTTPException(409, "Supplier purchase order already has a terminal decision.")
        return po
    if po.status == "pending" and po.attempts == 0:
        raise HTTPException(409, "A purchase order must be forwarded before it can be confirmed.")
    if order.payment_status != "paid" or order.status != "processing":
        raise HTTPException(409, "Order requires merchant review before supplier confirmation.")
    if decision == "confirmed" and not supplier_order_id:
        raise HTTPException(422, "Confirmed purchase orders require the supplier order reference.")
    if decision == "confirmed" and po.supplier_order_id and po.supplier_order_id != supplier_order_id:
        raise HTTPException(409, "Supplier order reference does not match the accepted purchase order.")
    db.add(SupplierConfirmation(supplier_id=po.supplier_id, purchase_order_id=po.id, event_id=event_id,
                                decision=decision, supplier_order_id=supplier_order_id, reason=reason))
    po.status, po.supplier_order_id, po.rejection_reason = decision, supplier_order_id or po.supplier_order_id, reason
    po.next_attempt_at, po.lease_until, po.last_error = None, None, None
    await db.flush()
    if decision == "rejected":
        # No stock is restored to the rejected source: its claimed availability
        # was disproved, and silently reselling that inventory would oversell it.
        if reason == "inventory_unavailable":
            for item in sorted(po.items, key=lambda value: value.variant_id):
                await db.scalar(select(ProductVariant).where(ProductVariant.id == item.variant_id).with_for_update())
                await db.execute(update(SupplierInventory).where(SupplierInventory.offer_id == item.offer_id)
                                 .values(on_hand=SupplierInventory.reserved).execution_options(synchronize_session=False))
                if await has_synced_inventory(db, item.variant_id):
                    await refresh_synced_variant(db, item.variant_id)
        await generate_purchase_orders(db, order)
    else:
        await refresh_fulfillment(db, order)
    db.add(OutboxEvent(event_type=f"supplier.order_{decision}", payload={"orderId": str(order.id), "purchaseOrderId": str(po.id)}))
    return po


async def load_order(db: AsyncSession, order_id: UUID) -> Order | None:
    return await db.scalar(select(Order).where(Order.id == order_id).options(selectinload(Order.items))
                            .with_for_update().execution_options(populate_existing=True))


async def load_purchase_order(db: AsyncSession, po_id: UUID) -> SupplierPurchaseOrder | None:
    return await db.scalar(select(SupplierPurchaseOrder).where(SupplierPurchaseOrder.id == po_id)
                            .options(selectinload(SupplierPurchaseOrder.items)).with_for_update()
                            .execution_options(populate_existing=True))
