"""Trusted shipment management and customer-visible delivery confirmation."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_db
from app.email_queue import enqueue_email_notification
from app.models import Customer, Order, OrderStatusHistory, OutboxEvent, Shipment, ShipmentEvent, ShipmentItem, utc_now
from app.rate_limit import enforce_rate_limit
from app.schemas import ShipmentCreateRequest, ShipmentStatusUpdateRequest
from app.security import get_current_customer, require_csrf, require_roles

router = APIRouter(prefix="/orders", tags=["shipments"])


def _status_values(shipment: Shipment) -> dict:
    return {
        "id": str(shipment.id), "shipmentNumber": shipment.shipment_number,
        "status": shipment.status, "carrier": shipment.carrier,
        "trackingNumber": shipment.tracking_number, "trackingUrl": shipment.tracking_url,
        "estimatedDeliveryAt": shipment.estimated_delivery_at.isoformat() if shipment.estimated_delivery_at else None,
        "shippedAt": shipment.shipped_at.isoformat() if shipment.shipped_at else None,
        "deliveredAt": shipment.delivered_at.isoformat() if shipment.delivered_at else None,
        "customerConfirmedAt": shipment.customer_confirmed_at.isoformat() if shipment.customer_confirmed_at else None,
        "items": [{"orderItemId": str(item.order_item_id), "quantity": item.quantity} for item in shipment.items],
    }


async def _locked_order(db: AsyncSession, order_id: UUID) -> Order:
    order = await db.scalar(select(Order).where(Order.id == order_id)
                            .options(selectinload(Order.items), selectinload(Order.shipments).selectinload(Shipment.items))
                            .with_for_update())
    if not order:
        raise HTTPException(404, "Order not found.")
    return order


async def _refresh_order_fulfillment(db: AsyncSession, order: Order) -> None:
    shipped_statuses = {"in_transit", "out_for_delivery", "delivered", "exception", "returned"}
    shipped_quantities: dict[UUID, int] = {}
    for shipment in order.shipments:
        for item in shipment.items:
            if shipment.status in shipped_statuses:
                shipped_quantities[item.order_item_id] = shipped_quantities.get(item.order_item_id, 0) + item.quantity
    total_shipped = sum(shipped_quantities.values())
    if not total_shipped:
        return  # Keep supplier-routing states (queued/on_hold/supplier_confirmed) independent.
    fully_shipped = all(shipped_quantities.get(item.id, 0) >= item.quantity for item in order.items)
    all_delivered = fully_shipped and all(
        shipment.status == "delivered" for shipment in order.shipments
        if shipment.status in shipped_statuses
    )
    previous_fulfillment = order.fulfillment_status
    previous_order_status = order.status
    if all_delivered:
        order.fulfillment_status = "delivered"
        order.status = "delivered"
    elif fully_shipped:
        order.fulfillment_status = "shipped"
        order.status = "shipped"
    else:
        order.fulfillment_status = "partially_shipped"
    if order.fulfillment_status != previous_fulfillment:
        db.add(OrderStatusHistory(order_id=order.id, from_status=previous_order_status, to_status=order.status,
                                  payment_status=order.payment_status, fulfillment_status=order.fulfillment_status,
                                  source="shipment", event_key=f"shipment-aggregate:{uuid4()}"))


@router.post("/{order_id}/shipments", response_model=dict)
async def create_shipment(order_id: UUID, payload: ShipmentCreateRequest, request: Request,
                          admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "shipment-create", 30, 60)
    order = await _locked_order(db, order_id)
    if order.payment_status != "paid" or order.status not in {"processing", "shipped"}:
        raise HTTPException(409, "Only paid, fulfillable orders can receive shipments.")
    item_by_id = {item.id: item for item in order.items}
    requested: dict[UUID, int] = {}
    for line in payload.items:
        if line.orderItemId not in item_by_id:
            raise HTTPException(422, "Shipment item does not belong to this order.")
        requested[line.orderItemId] = requested.get(line.orderItemId, 0) + line.quantity
    if len(requested) != len(payload.items):
        raise HTTPException(422, "A shipment may include each order item only once.")
    already_allocated: dict[UUID, int] = {}
    for previous in order.shipments:
        for line in previous.items:
            already_allocated[line.order_item_id] = already_allocated.get(line.order_item_id, 0) + line.quantity
    for item_id, quantity in requested.items():
        if already_allocated.get(item_id, 0) + quantity > item_by_id[item_id].quantity:
            raise HTTPException(409, "Shipment quantity exceeds the unshipped quantity for an order item.")
    identifier = uuid4()
    shipment = Shipment(id=identifier, order_id=order.id,
                        shipment_number=f"PS-{utc_now():%y%m%d}-{identifier.hex[:12].upper()}",
                        status="label_created", carrier=payload.carrier, tracking_number=payload.trackingNumber,
                        tracking_url=payload.trackingUrl, estimated_delivery_at=payload.estimatedDeliveryAt,
                        created_by=admin.id,
                        items=[ShipmentItem(order_item_id=item_id, quantity=quantity) for item_id, quantity in requested.items()])
    db.add(shipment)
    db.add(ShipmentEvent(shipment_id=identifier, from_status=None, to_status="label_created", source="operator",
                         event_key=f"created:{identifier}", details={}))
    db.add(OutboxEvent(event_type="shipment.created", payload={"orderId": str(order.id), "shipmentId": str(identifier)}))
    await db.flush()
    shipment.items = list(shipment.items)
    await db.commit()
    return {"data": _status_values(shipment)}


@router.post("/{order_id}/shipments/{shipment_id}/status", response_model=dict)
async def update_shipment_status(order_id: UUID, shipment_id: UUID, payload: ShipmentStatusUpdateRequest,
                                 request: Request, _admin: Customer = Depends(require_roles("admin")),
                                 db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "shipment-status-update", 60, 60)
    order = await _locked_order(db, order_id)
    shipment = await db.scalar(select(Shipment).where(Shipment.id == shipment_id, Shipment.order_id == order.id)
                               .options(selectinload(Shipment.items)))
    if not shipment:
        raise HTTPException(404, "Shipment not found.")
    previous_event = await db.scalar(select(ShipmentEvent).where(
        ShipmentEvent.shipment_id == shipment.id, ShipmentEvent.event_key == str(payload.eventId)))
    if previous_event:
        same_time = True
        if payload.occurredAt is not None:
            previous_time = previous_event.occurred_at
            requested_time = payload.occurredAt
            if previous_time.tzinfo is None:
                previous_time = previous_time.replace(tzinfo=timezone.utc)
            if requested_time.tzinfo is None:
                requested_time = requested_time.replace(tzinfo=timezone.utc)
            same_time = previous_time == requested_time
        if (previous_event.to_status != payload.status or
                previous_event.details.get("note") != payload.note or not same_time):
            raise HTTPException(409, "Event ID was already used with different shipment update data.")
        return {"data": _status_values(shipment)}
    allowed = {
        "label_created": {"in_transit", "exception"},
        "in_transit": {"out_for_delivery", "delivered", "exception", "returned"},
        "out_for_delivery": {"delivered", "exception", "returned"},
        "exception": {"in_transit", "out_for_delivery", "delivered", "returned"},
        "returned": set(), "delivered": set(),
    }
    if payload.status not in allowed.get(shipment.status, set()):
        raise HTTPException(409, "This shipment status transition is not permitted.")
    old_status = shipment.status
    shipment.status = payload.status
    occurred_at = payload.occurredAt or datetime.now(timezone.utc)
    if payload.status == "in_transit":
        shipment.shipped_at = occurred_at
    if payload.status == "delivered":
        shipment.delivered_at = occurred_at
    db.add(ShipmentEvent(shipment_id=shipment.id, from_status=old_status, to_status=payload.status,
                         source="operator", event_key=str(payload.eventId), occurred_at=occurred_at,
                         details={"note": payload.note} if payload.note else {}))
    await db.flush()
    order.shipments = list(order.shipments)
    await _refresh_order_fulfillment(db, order)
    outbox = OutboxEvent(event_type=f"shipment.{payload.status}",
                         payload={"orderId": str(order.id), "shipmentId": str(shipment.id)})
    email_template = {"in_transit": "shipping_notification", "delivered": "delivery_notification"}.get(payload.status)
    if email_template:
        enqueue_email_notification(
            db, outbox, template=email_template, recipient=order.customer_email,
            payload={"orderNumber": order.order_number, "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                     "carrier": shipment.carrier, "trackingNumber": shipment.tracking_number,
                     "trackingUrl": shipment.tracking_url,
                     "estimatedDeliveryAt": shipment.estimated_delivery_at.isoformat() if shipment.estimated_delivery_at else None},
        )
    else:
        db.add(outbox)
    await db.commit()
    return {"data": _status_values(shipment)}


@router.post("/{order_id}/shipments/{shipment_id}/confirm-delivery", response_model=dict)
async def confirm_delivery(order_id: UUID, shipment_id: UUID, request: Request,
                           customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "shipment-delivery-confirmation", 10, 60)
    ownership = (Order.customer_id == customer.id) | (Order.customer_id.is_(None) & (Order.customer_email == customer.email))
    shipment = await db.scalar(select(Shipment).join(Order).where(
        Shipment.id == shipment_id, Shipment.order_id == order_id, ownership,
    ).options(selectinload(Shipment.items)))
    if not shipment:
        raise HTTPException(404, "Shipment not found.")
    if shipment.status != "delivered":
        raise HTTPException(409, "Delivery can be confirmed only after the shipment is marked delivered.")
    if shipment.customer_confirmed_at is None:
        shipment.customer_confirmed_at = utc_now()
        db.add(ShipmentEvent(shipment_id=shipment.id, from_status="delivered", to_status="delivered", source="customer",
                             event_key=f"customer-delivery-confirmed:{customer.id}", details={}))
        await db.commit()
    return {"data": _status_values(shipment)}
