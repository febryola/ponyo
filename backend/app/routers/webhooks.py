"""Signature-verified, idempotent Stripe snapshot webhook processing."""

import asyncio
from collections.abc import Mapping
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_db
from app.models import Order, ProcessedWebhook
from app.payments import apply_intent, apply_refund, mark_paid, reference_id, release_payment
router = APIRouter(prefix="/webhooks", tags=["payments"])

SESSION_EVENTS = {"checkout.session.completed", "checkout.session.async_payment_succeeded",
                  "checkout.session.expired", "checkout.session.async_payment_failed"}
INTENT_EVENTS = {"payment_intent.succeeded", "payment_intent.amount_capturable_updated",
                 "payment_intent.payment_failed", "payment_intent.canceled", "payment_intent.processing"}
REFUND_EVENTS = {"refund.created", "refund.updated", "refund.failed"}

async def locked_order(db: AsyncSession, reference: str | None, *, intent_id: str | None = None):
    if reference:
        try:
            query = select(Order).where(Order.id == UUID(reference))
        except (ValueError, TypeError):
            raise HTTPException(400, "Payment event contains an invalid order reference.") from None
    elif intent_id:
        query = select(Order).where(Order.stripe_payment_intent_id == intent_id)
    else:
        return None
    return await db.scalar(query.options(selectinload(Order.items)).with_for_update().execution_options(populate_existing=True))

def metadata_reference(obj: Mapping) -> str | None:
    metadata = obj.get("metadata") or {}
    if not isinstance(metadata, Mapping):
        raise HTTPException(400, "Invalid payment metadata.")
    return metadata.get("ponyo_order_id")

async def retrieve_intent(identifier: str):
    if not settings.stripe_secret_key:
        raise HTTPException(503, "Stripe credentials are required to synchronize this event.")
    stripe.api_key = settings.stripe_secret_key
    try:
        intent = await asyncio.to_thread(stripe.PaymentIntent.retrieve, identifier)
    except stripe.StripeError:
        raise HTTPException(503, "Payment state could not be verified. Retry event delivery.") from None
    if not isinstance(intent, Mapping) or intent.get("id") != identifier:
        raise HTTPException(400, "Provider returned a mismatched payment intent.")
    return intent

@router.post("/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    if not settings.stripe_webhook_secret:
        raise HTTPException(503, "Payment webhook is not configured.")
    body = await request.body()
    if len(body) > 1024 * 1024:
        raise HTTPException(413, "Payment event is too large.")
    try:
        event = stripe.Webhook.construct_event(body, request.headers.get("stripe-signature", ""), settings.stripe_webhook_secret)
    except (ValueError, stripe.SignatureVerificationError):
        raise HTTPException(400, "Invalid payment webhook signature.") from None
    if not isinstance(event, Mapping) or not isinstance(event.get("id"), str) or not isinstance(event.get("data"), Mapping):
        raise HTTPException(400, "Invalid payment event.")
    event_id, event_type = event["id"], event.get("type")
    obj = event["data"].get("object")
    if not isinstance(obj, Mapping):
        raise HTTPException(400, "Invalid payment event object.")
    if await db.get(ProcessedWebhook, event_id):
        return {"received": True}

    # Fetch current provider objects BEFORE taking order/stock locks. Stale events
    # must never regress a capture or revive a failed refund.
    intent, refund = None, None
    if event_type in INTENT_EVENTS:
        identifier = reference_id(obj)
        if not identifier or not identifier.startswith("pi_"):
            raise HTTPException(400, "Invalid payment intent identity.")
        intent = await retrieve_intent(identifier)
    elif event_type in REFUND_EVENTS:
        require_id = reference_id(obj)
        if not require_id or not require_id.startswith("re_"):
            raise HTTPException(400, "Invalid refund identity.")
        if not settings.stripe_secret_key:
            raise HTTPException(503, "Stripe credentials are required to synchronize refunds.")
        stripe.api_key = settings.stripe_secret_key
        try:
            refund = await asyncio.to_thread(stripe.Refund.retrieve, require_id)
        except stripe.StripeError:
            raise HTTPException(503, "Refund state could not be verified. Retry event delivery.") from None
        if not isinstance(refund, Mapping) or refund.get("id") != require_id:
            raise HTTPException(400, "Provider returned a mismatched refund.")
        identifier = reference_id(refund.get("payment_intent"))
        if not identifier:
            raise HTTPException(400, "Refund has no payment intent reference.")
        intent = await retrieve_intent(identifier)
    elif event_type in SESSION_EVENTS and obj.get("payment_status") == "unpaid" and event_type == "checkout.session.completed":
        identifier = reference_id(obj.get("payment_intent"))
        if identifier:
            intent = await retrieve_intent(identifier)

    db.add(ProcessedWebhook(event_id=event_id, provider="stripe"))
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(503, "Payment event is already being processed. Retry delivery.") from None

    if event_type in SESSION_EVENTS:
        reference = metadata_reference(obj) or obj.get("client_reference_id")
        order = await locked_order(db, reference)
        if reference and order is None:
            raise HTTPException(503, "Order is not available yet. Retry payment event delivery.")
        if order:
            if not order.stripe_session_id or obj.get("id") != order.stripe_session_id:
                raise HTTPException(400, "Payment session does not match the order.")
            identifier = reference_id(obj.get("payment_intent"))
            if identifier:
                if order.stripe_payment_intent_id and order.stripe_payment_intent_id != identifier:
                    raise HTTPException(400, "Payment intent does not match the order.")
                order.stripe_payment_intent_id = identifier
            paid = obj.get("payment_status") == "paid" or (order.total_amount == 0 and obj.get("payment_status") == "no_payment_required")
            if event_type in {"checkout.session.completed", "checkout.session.async_payment_succeeded"} and paid:
                if obj.get("amount_total") != order.total_amount or str(obj.get("currency", "")).upper() != order.currency:
                    raise HTTPException(400, "Payment amount does not match the order total.")
                await mark_paid(db, order, reference=identifier or order.stripe_session_id, key=event_id)
            elif intent is not None:
                await apply_intent(db, order, intent, key=event_id)
            elif event_type in {"checkout.session.expired", "checkout.session.async_payment_failed"} and order.payment_status != "authorized":
                await release_payment(db, order, reference=order.stripe_session_id, key=event_id)
    elif intent is not None:
        reference = metadata_reference(intent)
        order = await locked_order(db, reference, intent_id=reference_id(intent))
        if reference and order is None:
            raise HTTPException(503, "Order is not available yet. Retry payment event delivery.")
        if order:
            await apply_intent(db, order, intent, key=event_id)
            if refund is not None:
                await apply_refund(db, order, refund, key=event_id)
    await db.commit()
    return {"received": True}
