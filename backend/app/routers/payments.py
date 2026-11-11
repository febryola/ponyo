"""Stripe reconciliation and admin-only money movement with durable idempotency."""

import asyncio
from collections.abc import Mapping
from datetime import datetime, timezone
from uuid import UUID, uuid4

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_db
from app.models import Customer, Order, PaymentTransaction
from app.payments import apply_intent, apply_refund, mark_paid, reference_id, release_payment, transaction_payload
from app.rate_limit import enforce_rate_limit
from app.schemas import PaymentCaptureRequest, PaymentRefundRequest
from app.security import get_authenticated_customer, require_csrf, require_roles

router = APIRouter(prefix="/payments", tags=["payments"])


def require_gateway() -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(503, "Stripe credentials are not configured.")
    stripe.api_key = settings.stripe_secret_key


async def payment_order(db: AsyncSession, order_id: UUID, actor: Customer, *, lock: bool = False) -> Order:
    query = select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    if actor.role == "customer":
        query = query.where((Order.customer_id == actor.id) | (Order.customer_id.is_(None) & (Order.customer_email == actor.email)))
    elif actor.role != "admin":
        raise HTTPException(403, "Your account cannot access payments.")
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    order = await db.scalar(query)
    if not order:
        raise HTTPException(404, "Payment order not found.")
    return order


async def payment_payload(db: AsyncSession, order: Order) -> dict:
    rows = await db.scalars(select(PaymentTransaction).where(PaymentTransaction.order_id == order.id)
                            .order_by(PaymentTransaction.created_at, PaymentTransaction.id))
    return {"orderId": str(order.id), "provider": order.payment_provider, "paymentStatus": order.payment_status,
            "orderStatus": order.status, "totalAmount": order.total_amount, "currency": order.currency,
            "captureMethod": order.capture_method, "capturedAmount": order.captured_amount,
            "refundedAmount": order.refunded_amount, "transactions": [transaction_payload(row) for row in rows]}


def retrieve_snapshot(session_id: str) -> tuple[Mapping, list]:
    require_gateway()
    session = stripe.checkout.Session.retrieve(session_id, expand=["payment_intent"])
    intent = session.get("payment_intent")
    if isinstance(intent, str):
        intent = stripe.PaymentIntent.retrieve(intent)
        session["payment_intent"] = intent
    refunds = []
    if isinstance(intent, Mapping) and intent.get("status") == "succeeded":
        for refund in stripe.Refund.list(payment_intent=intent["id"], limit=100).auto_paging_iter():
            refunds.append(refund)
            if len(refunds) > 1000:
                raise HTTPException(503, "Payment has too many refund records for interactive reconciliation.")
    return session, refunds


async def reconcile_order(db: AsyncSession, order_id: UUID, actor: Customer) -> Order:
    order = await payment_order(db, order_id, actor)
    session_id = order.stripe_session_id
    if not session_id:
        raise HTTPException(409, "This order does not have a Stripe checkout session.")
    # Authenticated actor state must survive ending the read transaction.
    actor_id, actor_email, actor_role = actor.id, actor.email, actor.role
    await db.rollback()
    try:
        snapshot, refunds = await asyncio.to_thread(retrieve_snapshot, session_id)
    except stripe.StripeError:
        raise HTTPException(503, "Stripe status is temporarily unavailable. No payment state was changed.") from None
    # Do not dereference expired actor attributes after rollback.
    from types import SimpleNamespace
    order = await payment_order(db, order_id, SimpleNamespace(id=actor_id, email=actor_email, role=actor_role), lock=True)
    if (snapshot.get("id") != session_id or order.stripe_session_id != session_id
            or (snapshot.get("metadata") or {}).get("ponyo_order_id") != str(order.id)
            or snapshot.get("amount_total") != order.total_amount
            or str(snapshot.get("currency", "")).upper() != order.currency):
        raise HTTPException(409, "Stripe checkout does not match the saved order.")
    intent = snapshot.get("payment_intent")
    key = f"sync:{uuid4()}"
    if isinstance(intent, Mapping):
        await apply_intent(db, order, intent, key=key)
    elif snapshot.get("payment_status") == "no_payment_required" and order.total_amount == 0 and snapshot.get("status") == "complete":
        await mark_paid(db, order, reference=session_id, key=key)
    elif snapshot.get("status") == "expired" and snapshot.get("payment_status") == "unpaid":
        await release_payment(db, order, reference=session_id, key=key)
    elif snapshot.get("payment_status") == "paid":
        # A paid positive-total payment must expose its intent before it can be validated.
        raise HTTPException(409, "Stripe payment intent is not available for verification.")
    for refund in refunds:
        await apply_refund(db, order, refund, key=key)
    await db.commit()
    return order


@router.get("/configuration", response_model=dict)
async def payment_configuration(_admin: Customer = Depends(require_roles("admin"))):
    return {"data": {"provider": "stripe", "credentialsConfigured": bool(settings.stripe_secret_key),
                     "webhookConfigured": bool(settings.stripe_webhook_secret), "captureMethod": settings.stripe_capture_method}}


@router.get("/orders/{order_id}", response_model=dict)
async def get_payment(order_id: UUID, actor: Customer = Depends(get_authenticated_customer), db: AsyncSession = Depends(get_db)):
    return {"data": await payment_payload(db, await payment_order(db, order_id, actor))}


@router.post("/orders/{order_id}/sync", response_model=dict)
async def sync_payment(order_id: UUID, request: Request, actor: Customer = Depends(get_authenticated_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "payment-sync", 10, 60)
    require_gateway()
    order = await reconcile_order(db, order_id, actor)
    return {"data": await payment_payload(db, order)}


async def prepare_operation(db: AsyncSession, order: Order, *, kind: str, amount: int, key: UUID, reason: str | None = None):
    idempotency = f"ponyo-{kind}-{key}"
    stored_kind = "capture_request" if kind == "capture" else kind
    existing = await db.scalar(select(PaymentTransaction).where(PaymentTransaction.idempotency_key == idempotency))
    if existing:
        if existing.order_id != order.id or existing.kind != stored_kind or existing.amount != amount or existing.reason != reason:
            raise HTTPException(409, "This idempotency key was already used for a different payment request.")
        created = existing.created_at.replace(tzinfo=timezone.utc) if existing.created_at.tzinfo is None else existing.created_at
        if existing.status in {"pending", "processing", "unknown"} and (datetime.now(timezone.utc) - created).total_seconds() >= 23 * 3600:
            # Stripe may prune idempotency keys after 24 hours. Never blindly
            # recreate an uncertain money movement once its replay guarantee ages out.
            raise HTTPException(409, "This unresolved payment operation requires reconciliation; its safe retry window has expired.")
        return existing
    if kind == "capture":
        if order.payment_status != "authorized" or order.status != "pending_payment":
            raise HTTPException(409, "Only an authorized, uncaptured order can be captured.")
        active = await db.scalar(select(PaymentTransaction.id).where(
            PaymentTransaction.order_id == order.id, PaymentTransaction.kind == "capture_request",
            PaymentTransaction.status.in_(["pending", "unknown", "processing"]),
        ).limit(1))
        if active:
            raise HTTPException(409, "A capture is already in progress. Retry with its original idempotency key.")
    elif kind == "refund":
        if order.payment_status not in {"paid", "partially_refunded", "payment_review"}:
            raise HTTPException(409, "Only captured payments can be refunded.")
        reserved = await db.scalar(select(func.coalesce(func.sum(PaymentTransaction.amount), 0)).where(
            PaymentTransaction.order_id == order.id, PaymentTransaction.kind == "refund",
            PaymentTransaction.status.in_(["pending", "processing", "unknown", "requires_action", "succeeded"]),
        )) or 0
        if amount > order.captured_amount - reserved:
            raise HTTPException(409, "Refund exceeds the remaining refundable amount, including pending requests.")
    if not order.stripe_payment_intent_id:
        raise HTTPException(409, "Synchronize this order with Stripe before moving funds.")
    row = PaymentTransaction(id=uuid4(), order_id=order.id, provider="stripe", kind="capture_request" if kind == "capture" else kind,
                             status="pending", amount=amount, currency=order.currency, reason=reason,
                             event_key=f"operation:{idempotency}", idempotency_key=idempotency)
    db.add(row)
    return row


async def perform_operation(db: AsyncSession, order_id: UUID, actor: Customer, *, kind: str, key: UUID, amount: int | None = None, reason: str | None = None):
    require_gateway()
    order = await payment_order(db, order_id, actor, lock=True)
    amount = order.total_amount if kind == "capture" else amount
    row = await prepare_operation(db, order, kind=kind, amount=amount, key=key, reason=reason)
    if row.status in {"succeeded", "failed", "canceled"}:
        return row
    # Persist the operation BEFORE Stripe I/O. Ambiguous failures keep this reservation.
    operation_id, intent_id, idempotency = row.id, order.stripe_payment_intent_id, row.idempotency_key
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "This payment operation is already being created. Retry using the same idempotency key.") from None
    try:
        if kind == "capture":
            result = await asyncio.to_thread(stripe.PaymentIntent.capture, intent_id, amount_to_capture=amount, idempotency_key=idempotency)
        else:
            result = await asyncio.to_thread(stripe.Refund.create, payment_intent=intent_id, amount=amount, reason=reason,
                                             metadata={"ponyo_order_id": str(order_id), "ponyo_operation_id": str(operation_id)},
                                             idempotency_key=idempotency)
    except stripe.StripeError as error:
        order = await db.scalar(select(Order).where(Order.id == order_id).with_for_update())
        row = await db.get(PaymentTransaction, operation_id, populate_existing=True)
        if row.status not in {"succeeded", "failed", "canceled"}:
            # Connection/5xx errors may occur AFTER Stripe accepts the request: never free their reserved amount.
            definitive = isinstance(error, (stripe.InvalidRequestError, stripe.CardError, stripe.AuthenticationError, stripe.PermissionError))
            row.status = "failed" if definitive else "unknown"
            row.error_code = str(getattr(error, "code", None) or type(error).__name__)[:80]
            await db.commit()
        raise HTTPException(503, "Stripe could not confirm the operation. Synchronize status or retry using the same idempotency key.") from None
    order = await db.scalar(select(Order).where(Order.id == order_id).options(selectinload(Order.items))
                            .with_for_update().execution_options(populate_existing=True))
    row = await db.get(PaymentTransaction, operation_id, populate_existing=True)
    try:
        if kind == "capture":
            if result.get("id") != intent_id:
                raise HTTPException(409, "Capture response does not match the payment.")
            await apply_intent(db, order, result, key=f"capture-operation:{operation_id}")
            if result.get("status") != "succeeded":
                row.status = "processing"  # never claim a capture succeeded while still pending
            else:
                row.status = "succeeded"
            row.provider_reference = intent_id
        else:
            if reference_id(result.get("payment_intent")) != intent_id or result.get("amount") != amount:
                raise HTTPException(409, "Refund response does not match the request.")
            await apply_refund(db, order, result, key=f"refund-operation:{operation_id}")
            if row.provider_reference is None:
                # Stripe normally echoes metadata; require it rather than creating a
                # second ledger entry and leaving the durable reservation unresolved.
                raise HTTPException(409, "Refund operation identity could not be verified. Synchronize before retrying.")
        await db.commit()
    except Exception:
        await db.rollback()
        # The original pending row remains durable. Reconciliation/webhook can complete it.
        raise
    return row


@router.post("/orders/{order_id}/capture", response_model=dict)
async def capture_payment(order_id: UUID, payload: PaymentCaptureRequest, request: Request,
                          admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "payment-capture", 10, 60)
    row = await perform_operation(db, order_id, admin, kind="capture", key=payload.idempotencyKey)
    return {"data": transaction_payload(row)}


@router.post("/orders/{order_id}/refunds", response_model=dict)
async def refund_payment(order_id: UUID, payload: PaymentRefundRequest, request: Request,
                         admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "payment-refund", 10, 60)
    row = await perform_operation(db, order_id, admin, kind="refund", key=payload.idempotencyKey,
                                   amount=payload.amount, reason=payload.reason)
    return {"data": transaction_payload(row)}


@router.post("/orders/{order_id}/void", response_model=dict)
async def void_authorization(order_id: UUID, payload: PaymentCaptureRequest, request: Request,
                             admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "payment-void", 10, 60)
    require_gateway()
    order = await payment_order(db, order_id, admin)
    if order.payment_status == "failed" and order.status == "cancelled":
        return {"data": await payment_payload(db, order)}
    if order.payment_status != "authorized" or not order.stripe_payment_intent_id:
        raise HTTPException(409, "Only an uncaptured authorization can be voided.")
    identifier = order.stripe_payment_intent_id
    await db.rollback()
    try:
        result = await asyncio.to_thread(stripe.PaymentIntent.cancel, identifier,
                                         idempotency_key=f"ponyo-void-{order_id}-{payload.idempotencyKey}")
    except stripe.StripeError:
        raise HTTPException(503, "Stripe could not confirm the void. Synchronize status before retrying.") from None
    order = await db.scalar(select(Order).where(Order.id == order_id).options(selectinload(Order.items))
                            .with_for_update().execution_options(populate_existing=True))
    if result.get("id") != identifier or result.get("status") != "canceled":
        raise HTTPException(409, "Authorization could not be confirmed as cancelled.")
    await apply_intent(db, order, result, key=f"void-operation:{payload.idempotencyKey}")
    await db.commit()
    return {"data": await payment_payload(db, order)}
