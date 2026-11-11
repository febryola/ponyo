"""Trusted operator-only fulfillment transitions. No customer-facing status override."""

import argparse
import asyncio
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import SessionLocal
from app.email_queue import enqueue_email_notification
from app.models import Order, OrderStatusHistory, OutboxEvent


async def transition_order(
    db: AsyncSession, order_id: UUID, status: str, *, tracking_number: str | None = None,
    tracking_carrier: str | None = None,
) -> Order:
    order = await db.scalar(select(Order).where(Order.id == order_id).options(selectinload(Order.items)).with_for_update())
    if not order:
        raise HTTPException(404, "Order not found.")
    allowed = {"processing": {"shipped"}, "shipped": {"delivered"}, "delivered": {"completed"}}
    if status not in allowed.get(order.status, set()) or order.payment_status != "paid":
        raise HTTPException(409, "This order status transition is not permitted.")
    if status == "shipped" and not (tracking_number and tracking_carrier):
        raise HTTPException(422, "Carrier and tracking number are required for shipment.")
    previous = order.status
    order.status = status
    order.fulfillment_status = {"shipped": "shipped", "delivered": "delivered", "completed": "fulfilled"}[status]
    if tracking_number:
        order.tracking_number = tracking_number
    if tracking_carrier:
        order.tracking_carrier = tracking_carrier
    db.add(OrderStatusHistory(order_id=order.id, from_status=previous, to_status=status,
                              payment_status=order.payment_status, fulfillment_status=order.fulfillment_status,
                              source="operator", event_key=f"operator:{uuid4()}"))
    event = OutboxEvent(event_type=f"order.{status}", payload={"orderId": str(order.id), "orderNumber": order.order_number})
    template = {"shipped": "shipping_notification", "delivered": "delivery_notification"}.get(status)
    if template:
        enqueue_email_notification(
            db, event, template=template, recipient=order.customer_email,
            payload={"orderNumber": order.order_number, "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                     "carrier": tracking_carrier or order.tracking_carrier or "Carrier",
                     "trackingNumber": tracking_number or order.tracking_number or "",
                     "trackingUrl": None},
        )
    else:
        db.add(event)
    return order


async def main() -> None:
    parser = argparse.ArgumentParser(description="Trusted operator fulfillment update (requires database access).")
    parser.add_argument("order_id", type=UUID)
    parser.add_argument("status", choices=["shipped", "delivered", "completed"])
    parser.add_argument("--tracking-number")
    parser.add_argument("--tracking-carrier")
    args = parser.parse_args()
    async with SessionLocal() as db:
        order = await transition_order(db, args.order_id, args.status, tracking_number=args.tracking_number,
                                       tracking_carrier=args.tracking_carrier)
        await db.commit()
        print(f"{order.order_number}: {order.status}")


if __name__ == "__main__":
    asyncio.run(main())
