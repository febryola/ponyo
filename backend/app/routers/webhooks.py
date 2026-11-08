import stripe
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_db
from app.models import Order, OutboxEvent, ProcessedWebhook, ProductVariant

router = APIRouter(prefix="/webhooks", tags=["payments"])


@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Payment webhook is not configured.")
    body = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(body, signature, settings.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid payment webhook signature.") from None

    event_id = event["id"]
    if await db.get(ProcessedWebhook, event_id):
        return {"received": True}
    db.add(ProcessedWebhook(event_id=event_id, provider="stripe"))
    try:
        # Acquire the unique event claim before applying side effects.
        await db.flush()
    except IntegrityError:
        await db.rollback()
        # A conflicting insert means another transaction owns this exact event.
        raise HTTPException(status_code=503, detail="Payment event is already being processed. Retry delivery.") from None
    event_type = event["type"]
    session_data = event["data"]["object"]
    order_id = (session_data.get("metadata") or {}).get("ponyo_order_id") or session_data.get("client_reference_id")
    order = None
    if order_id and event_type in {"checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "checkout.session.async_payment_failed"}:
        try:
            parsed_order_id = UUID(order_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Payment event contains an invalid order reference.") from None
        order = await db.scalar(select(Order).where(Order.id == parsed_order_id).options(selectinload(Order.items)).with_for_update())
        if not order:
            # The payment can arrive before the order transaction is visible; let Stripe retry.
            raise HTTPException(status_code=503, detail="Order is not available yet. Retry payment event delivery.")
        if not order.stripe_session_id or session_data.get("id") != order.stripe_session_id:
            raise HTTPException(status_code=400, detail="Payment session does not match the order.")
        if event_type in {"checkout.session.completed", "checkout.session.async_payment_succeeded"} and session_data.get("payment_status") == "paid":
            if session_data.get("amount_total") != order.total_amount or session_data.get("currency", "").upper() != order.currency:
                raise HTTPException(status_code=400, detail="Payment amount does not match the order total.")
            if order.payment_status != "paid":
                result = await db.execute(
                    update(Order)
                    .where(Order.id == order.id, Order.payment_status != "paid")
                    .values(payment_status="paid", status="processing", fulfillment_status="queued")
                )
                if result.rowcount == 1:
                    order.payment_status = "paid"
                    order.status = "processing"
                    order.fulfillment_status = "queued"
                    db.add(OutboxEvent(
                        event_type="order.payment_succeeded",
                        payload={
                            "orderId": str(order.id),
                            "orderNumber": order.order_number,
                            "currency": order.currency,
                            "shippingMethod": order.shipping_method,
                            "items": [
                                {"variantId": str(item.variant_id), "quantity": item.quantity}
                                for item in order.items
                            ],
                        },
                    ))
        elif event_type in {"checkout.session.expired", "checkout.session.async_payment_failed"} and order.payment_status != "paid":
            result = await db.execute(
                update(Order)
                .where(Order.id == order.id, Order.payment_status != "paid", Order.status != "cancelled")
                .values(status="cancelled", payment_status="failed")
            )
            if result.rowcount != 1:
                await db.rollback()
                return {"received": True}
            for item in order.items:
                variant = await db.scalar(select(ProductVariant).where(ProductVariant.id == item.variant_id).with_for_update())
                if variant:
                    variant.stock_quantity += item.quantity
            order.status = "cancelled"
            order.payment_status = "failed"
    await db.commit()
    return {"received": True}
