import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.config import settings
from app.email_queue import enqueue_email_notification
from app.media import storefront_image_url
from app.models import Customer, Order, OrderStatusHistory, OutboxEvent, ProductVariant, Shipment
from app.inventory import restore_variant_stock, settle_supplier_stock
from app.reservation_expiry import _confirmed_expired, provider_status
from app.schemas import OrderCancellationRequest, OrderStatusUpdateRequest
from app.order_management import transition_order
from app.payments import record_transaction
from app.rate_limit import enforce_rate_limit
from app.security import get_current_customer, require_csrf, require_roles

router = APIRouter(prefix="/orders", tags=["orders"])


def shipment_load_options():
    return (
        selectinload(Order.shipments).selectinload(Shipment.items),
        selectinload(Order.shipments).selectinload(Shipment.events),
    )


def owned_orders(customer: Customer):
    # Email lookup is only a fallback for genuinely unlinked legacy orders.
    return (Order.customer_id == customer.id) | (Order.customer_id.is_(None) & (Order.customer_email == customer.email))


@router.post("/{order_id}/status", response_model=dict)
async def update_order_status(order_id: UUID, payload: OrderStatusUpdateRequest, request: Request,
                              _admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "order-status-update", 30, 60)
    order = await transition_order(db, order_id, payload.status,
                                   tracking_number=payload.trackingNumber, tracking_carrier=payload.trackingCarrier)
    order = await db.scalar(select(Order).where(Order.id == order_id)
                            .options(selectinload(Order.items), *shipment_load_options())
                            .execution_options(populate_existing=True))
    await db.commit()
    return {"data": order_payload(order)}


def order_payload(order: Order) -> dict:
    address = order.shipping_address
    address_text = ", ".join(
        part
        for part in (
            f"{address.get('firstName', '')} {address.get('lastName', '')}".strip(),
            address.get("address1", ""),
            address.get("address2", ""),
            address.get("region", ""),
            address.get("city", ""),
            address.get("postalCode", ""),
            address.get("countryCode", ""),
        )
        if part
    )
    return {
        "id": str(order.id),
        "orderNumber": order.order_number,
        "createdAt": order.created_at.isoformat(),
        "status": order.status,
        "paymentStatus": order.payment_status,
        "capturedAmount": order.captured_amount,
        "refundedAmount": order.refunded_amount,
        "captureMethod": order.capture_method,
        "fulfillmentStatus": order.fulfillment_status,
        "supplierFulfillmentStatus": order.supplier_fulfillment_status,
        "customerEmail": order.customer_email,
        "deliveryAddress": address_text,
        "trackingNumber": order.tracking_number,
        "trackingCarrier": order.tracking_carrier,
        "shipments": [
            {
                "id": str(shipment.id),
                "shipmentNumber": shipment.shipment_number,
                "status": shipment.status,
                "carrier": shipment.carrier,
                "trackingNumber": shipment.tracking_number,
                "trackingUrl": shipment.tracking_url,
                "estimatedDeliveryAt": shipment.estimated_delivery_at.isoformat() if shipment.estimated_delivery_at else None,
                "shippedAt": shipment.shipped_at.isoformat() if shipment.shipped_at else None,
                "deliveredAt": shipment.delivered_at.isoformat() if shipment.delivered_at else None,
                "customerConfirmedAt": shipment.customer_confirmed_at.isoformat() if shipment.customer_confirmed_at else None,
                "items": [{"orderItemId": str(line.order_item_id), "quantity": line.quantity} for line in shipment.items],
                "events": [{"status": event.to_status, "source": event.source,
                            "occurredAt": event.occurred_at.isoformat(), "note": event.details.get("note")}
                           for event in shipment.events],
            }
            for shipment in order.shipments
        ],
        "totalAmount": order.total_amount,
        "subtotalAmount": order.subtotal_amount,
        "discountAmount": order.discount_amount,
        "shippingAmount": order.shipping_amount,
        "taxAmount": order.tax_amount,
        "taxRateBps": order.tax_rate_bps,
        "couponCode": order.coupon_code,
        "cancellationReason": order.cancellation_reason,
        "currency": order.currency,
        "items": [
            {
                "id": str(item.id),
                "name": item.product_name,
                "image": storefront_image_url(item.image_url),
                "imageAlt": item.image_alt,
                "maker": item.supplier_name,
                "quantity": item.quantity,
                "unitPrice": item.unit_price,
                "currency": item.currency,
                "discountAmount": item.discount_amount,
                "subtotalAmount": item.unit_price * item.quantity,
                "totalAmount": item.unit_price * item.quantity - item.discount_amount,
                "variantId": str(item.variant_id),
                "productSnapshot": item.product_snapshot,
            }
            for item in order.items
        ],
    }


@router.get("", response_model=dict)
async def list_orders(customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    orders = await db.scalars(
        select(Order)
        .where(owned_orders(customer))
        .options(selectinload(Order.items), selectinload(Order.shipments).selectinload(Shipment.items),
             selectinload(Order.shipments).selectinload(Shipment.events))
        .order_by(Order.created_at.desc())
    )
    return {"data": [order_payload(order) for order in orders]}


@router.get("/{order_id}", response_model=dict)
async def get_order(order_id: UUID, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    order = await db.scalar(
        select(Order)
        .where(Order.id == order_id, owned_orders(customer))
        .options(selectinload(Order.items), selectinload(Order.shipments).selectinload(Shipment.items),
             selectinload(Order.shipments).selectinload(Shipment.events))
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return {"data": order_payload(order)}


@router.get("/{order_id}/history", response_model=dict)
async def order_history(order_id: UUID, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    order = await db.scalar(select(Order).where(
        Order.id == order_id, owned_orders(customer),
    ))
    if not order:
        raise HTTPException(404, "Order not found.")
    rows = await db.scalars(select(OrderStatusHistory).where(OrderStatusHistory.order_id == order_id)
                            .order_by(OrderStatusHistory.created_at, OrderStatusHistory.id))
    return {"data": [{"fromStatus": row.from_status, "toStatus": row.to_status,
                      "paymentStatus": row.payment_status, "fulfillmentStatus": row.fulfillment_status,
                      "source": row.source, "createdAt": row.created_at.isoformat()} for row in rows]}


@router.post("/{order_id}/cancel", response_model=dict)
async def cancel_order(order_id: UUID, payload: OrderCancellationRequest, request: Request,
                       customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "order-cancel", 10, 60)
    ownership = owned_orders(customer)
    order = await db.scalar(select(Order).where(Order.id == order_id, ownership)
                            .options(selectinload(Order.items), *shipment_load_options()))
    if not order:
        raise HTTPException(404, "Order not found.")
    if order.status == "cancelled":
        return {"data": order_payload(order)}
    if order.status != "pending_payment" or order.payment_status != "unpaid" or not order.stripe_session_id:
        raise HTTPException(409, "Only unpaid pending orders can be cancelled. Contact support for a paid order.")
    session_id = order.stripe_session_id
    # End the read transaction before network I/O; no inventory is restored until Stripe confirms expiry.
    await db.rollback()
    try:
        session = await asyncio.to_thread(provider_status, session_id)
    except Exception:
        raise HTTPException(503, "Payment provider could not confirm cancellation. Please try again.") from None
    if not _confirmed_expired(session, session_id, order_id):
        raise HTTPException(409, "Payment may already be in progress or completed. Refresh the order before cancelling.")
    order = await db.scalar(select(Order).where(Order.id == order_id, ownership)
                            .options(selectinload(Order.items), *shipment_load_options()).with_for_update().execution_options(populate_existing=True))
    if not order:
        raise HTTPException(404, "Order not found.")
    if order.status == "cancelled":
        return {"data": order_payload(order)}
    if order.status != "pending_payment" or order.payment_status != "unpaid" or order.stripe_session_id != session_id:
        raise HTTPException(409, "Order status changed. Refresh the order before cancelling.")
    claimed = await db.execute(update(Order).where(
        Order.id == order_id, Order.status == "pending_payment", Order.payment_status == "unpaid",
        Order.stripe_session_id == session_id,
    ).values(status="cancelled").execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "Order status changed. Refresh the order before cancelling.")
    await db.scalars(select(ProductVariant).where(ProductVariant.id.in_([item.variant_id for item in order.items]))
                     .order_by(ProductVariant.id).with_for_update())
    for item in sorted(order.items, key=lambda item: item.variant_id):
        await settle_supplier_stock(db, item, paid=False)
        await restore_variant_stock(db, item)
    order.status = "cancelled"
    order.cancellation_reason = payload.reason.strip() or None
    await record_transaction(db, order, kind="void", status="succeeded", amount=order.total_amount,
                             reference=session_id, key=f"void:{order.id}")
    db.add(OrderStatusHistory(order_id=order.id, from_status="pending_payment", to_status="cancelled",
                              payment_status="unpaid", fulfillment_status=order.fulfillment_status,
                              source="customer", event_key=f"customer.cancelled:{order.id}"))
    cancellation_event = OutboxEvent(event_type="order.cancelled", payload={"orderId": str(order.id), "orderNumber": order.order_number})
    enqueue_email_notification(
        db, cancellation_event, template="cancellation_notification", recipient=order.customer_email,
        payload={"orderNumber": order.order_number, "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                 "reason": order.cancellation_reason or ""},
    )
    await db.commit()
    return {"data": order_payload(order)}
