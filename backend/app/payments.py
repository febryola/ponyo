"""Validated Stripe lifecycle transitions. Callers hold the order lock.

Never trust browser redirects as evidence of payment. Keep network I/O out of
these functions; webhook signatures or provider API reads establish provenance.
"""

from collections.abc import Mapping

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.email_queue import enqueue_email_notification
from app.inventory import restore_variant_stock, settle_supplier_stock
from app.models import Order, OrderStatusHistory, OutboxEvent, PaymentTransaction, ProductVariant


SETTLED_PAYMENT_STATES = {"paid", "partially_refunded", "refunded", "payment_review"}


def reference_id(value) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, Mapping) and isinstance(value.get("id"), str):
        return value["id"]
    return None


def transaction_payload(row: PaymentTransaction) -> dict:
    return {"id": str(row.id), "orderId": str(row.order_id), "provider": row.provider,
            "kind": row.kind, "status": row.status, "amount": row.amount, "currency": row.currency,
            "providerReference": row.provider_reference, "reason": row.reason,
            "errorCode": row.error_code, "createdAt": row.created_at.isoformat()}


async def record_transaction(db: AsyncSession, order: Order, *, kind: str, status: str, amount: int,
                             reference: str | None, key: str, error_code: str | None = None):
    row = await db.scalar(select(PaymentTransaction).where(PaymentTransaction.event_key == key))
    if row is None:
        row = PaymentTransaction(order_id=order.id, provider="stripe", kind=kind, status=status,
                                 amount=amount, currency=order.currency, provider_reference=reference,
                                 event_key=key, error_code=error_code)
        db.add(row)
    return row


async def lock_variants(db: AsyncSession, order: Order) -> None:
    await db.scalars(select(ProductVariant).where(ProductVariant.id.in_([item.variant_id for item in order.items]))
                     .order_by(ProductVariant.id).with_for_update())


async def mark_paid(db: AsyncSession, order: Order, *, reference: str | None, key: str) -> None:
    await db.execute(update(PaymentTransaction).where(
        PaymentTransaction.order_id == order.id, PaymentTransaction.kind == "capture_request",
        PaymentTransaction.status.in_(["pending", "processing", "unknown"]),
    ).values(status="succeeded", provider_reference=reference).execution_options(synchronize_session=False))
    if order.payment_status in SETTLED_PAYMENT_STATES:
        return
    await record_transaction(db, order, kind="capture", status="succeeded", amount=order.total_amount,
                             reference=reference, key=f"capture:{order.id}")
    order.captured_amount = order.total_amount
    if order.status == "cancelled":
        # Do not fulfill a late payment against stock already returned to the catalog.
        order.payment_status = "payment_review"
        db.add(OutboxEvent(event_type="order.payment_review", payload={"orderId": str(order.id)}))
        return
    previous = order.status
    result = await db.execute(update(Order).where(
        Order.id == order.id, Order.payment_status.not_in(SETTLED_PAYMENT_STATES), Order.status != "cancelled",
    ).values(payment_status="paid", status="processing", fulfillment_status="queued", captured_amount=order.total_amount)
        .execution_options(synchronize_session=False))
    if result.rowcount != 1:
        raise HTTPException(409, "Payment state changed. Retry synchronization.")
    await lock_variants(db, order)
    for item in sorted(order.items, key=lambda item: item.variant_id):
        await settle_supplier_stock(db, item, paid=True)
    order.payment_status, order.status, order.fulfillment_status = "paid", "processing", "queued"
    db.add(OrderStatusHistory(order_id=order.id, from_status=previous, to_status="processing",
                              payment_status="paid", fulfillment_status="queued", source="stripe", event_key=key))
    event = OutboxEvent(event_type="order.payment_succeeded", payload={
        "orderId": str(order.id), "orderNumber": order.order_number, "currency": order.currency,
        "shippingMethod": order.shipping_method,
        "items": [{"variantId": str(item.variant_id), "quantity": item.quantity} for item in order.items],
    })
    notification_payload = {
        "orderNumber": order.order_number, "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
        "totalAmount": order.total_amount, "amount": order.total_amount, "currency": order.currency,
        "items": [{"name": item.product_name, "quantity": item.quantity} for item in order.items],
    }
    enqueue_email_notification(db, event, template="order_confirmation", recipient=order.customer_email,
                               payload=notification_payload)
    enqueue_email_notification(db, event, template="payment_confirmation", recipient=order.customer_email,
                               payload=notification_payload)


async def release_payment(db: AsyncSession, order: Order, *, reference: str | None, key: str) -> None:
    if order.payment_status in SETTLED_PAYMENT_STATES or order.status == "cancelled":
        return
    previous = order.status
    result = await db.execute(update(Order).where(
        Order.id == order.id, Order.payment_status.not_in(SETTLED_PAYMENT_STATES), Order.status != "cancelled",
    ).values(status="cancelled", payment_status="failed").execution_options(synchronize_session=False))
    if result.rowcount != 1:
        raise HTTPException(409, "Payment state changed. Retry synchronization.")
    await lock_variants(db, order)
    for item in sorted(order.items, key=lambda item: item.variant_id):
        await settle_supplier_stock(db, item, paid=False)
        await restore_variant_stock(db, item)
    order.status, order.payment_status = "cancelled", "failed"
    await record_transaction(db, order, kind="void", status="succeeded", amount=order.total_amount,
                             reference=reference, key=f"void:{order.id}")
    db.add(OrderStatusHistory(order_id=order.id, from_status=previous, to_status="cancelled",
                              payment_status="failed", fulfillment_status=order.fulfillment_status,
                              source="stripe", event_key=key))
    event = OutboxEvent(event_type="order.payment_failed", payload={"orderId": str(order.id), "orderNumber": order.order_number})
    enqueue_email_notification(
        db, event, template="cancellation_notification", recipient=order.customer_email,
        payload={"orderNumber": order.order_number, "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                 "reason": "Payment could not be completed."},
    )


def bind_intent(order: Order, intent: Mapping) -> str:
    identifier = reference_id(intent)
    if not identifier or not identifier.startswith("pi_"):
        raise HTTPException(400, "Invalid payment intent identity.")
    if order.stripe_payment_intent_id and order.stripe_payment_intent_id != identifier:
        raise HTTPException(400, "Payment intent does not match the order.")
    metadata = intent.get("metadata") or {}
    if not isinstance(metadata, Mapping) or metadata.get("ponyo_order_id") != str(order.id):
        raise HTTPException(400, "Payment intent reference does not match the order.")
    if type(intent.get("amount")) is not int or intent["amount"] != order.total_amount or str(intent.get("currency", "")).upper() != order.currency:
        raise HTTPException(400, "Payment amount or currency does not match the order.")
    order.stripe_payment_intent_id = identifier
    return identifier


async def apply_intent(db: AsyncSession, order: Order, intent: Mapping, *, key: str) -> None:
    identifier = bind_intent(order, intent)
    status = intent.get("status")
    if status == "succeeded":
        if type(intent.get("amount_received")) is not int or intent["amount_received"] != order.total_amount:
            raise HTTPException(400, "Captured amount does not match the order.")
        await mark_paid(db, order, reference=identifier, key=key)
    elif status == "requires_capture":
        if type(intent.get("amount_capturable")) is not int or intent["amount_capturable"] != order.total_amount:
            raise HTTPException(400, "Authorized amount does not match the order.")
        if order.payment_status in SETTLED_PAYMENT_STATES or order.status == "cancelled":
            return
        if order.payment_status != "authorized":
            order.payment_status = "authorized"
            await record_transaction(db, order, kind="authorization", status="succeeded", amount=order.total_amount,
                                     reference=identifier, key=f"authorization:{order.id}")
            db.add(OrderStatusHistory(order_id=order.id, from_status=order.status, to_status=order.status,
                                      payment_status="authorized", fulfillment_status=order.fulfillment_status,
                                      source="stripe", event_key=key))
    elif status == "canceled":
        await db.execute(update(PaymentTransaction).where(
            PaymentTransaction.order_id == order.id, PaymentTransaction.kind == "capture_request",
            PaymentTransaction.status.in_(["pending", "processing", "unknown"]),
        ).values(status="failed", error_code="authorization_canceled").execution_options(synchronize_session=False))
        await release_payment(db, order, reference=identifier, key=key)
    elif status in {"requires_payment_method", "requires_action", "processing", "requires_confirmation"}:
        if intent.get("last_payment_error") and order.payment_status not in SETTLED_PAYMENT_STATES:
            error = intent["last_payment_error"]
            code = error.get("decline_code") or error.get("code") if isinstance(error, Mapping) else "payment_failed"
            await record_transaction(db, order, kind="payment_attempt", status="failed", amount=order.total_amount,
                                     reference=identifier, key=key, error_code=str(code or "payment_failed")[:80])
        # A declined attempt can be retried in Checkout. It is not proof of terminal expiry.
    else:
        raise HTTPException(400, "Unsupported payment intent status.")


async def apply_refund(db: AsyncSession, order: Order, refund: Mapping, *, key: str) -> PaymentTransaction:
    identifier = reference_id(refund)
    if not identifier or not identifier.startswith("re_"):
        raise HTTPException(400, "Invalid refund identity.")
    if reference_id(refund.get("payment_intent")) != order.stripe_payment_intent_id:
        raise HTTPException(400, "Refund payment reference does not match the order.")
    amount = refund.get("amount")
    if type(amount) is not int or amount <= 0 or amount > order.captured_amount or str(refund.get("currency", "")).upper() != order.currency:
        raise HTTPException(400, "Refund amount or currency is invalid.")
    status = refund.get("status")
    if status not in {"pending", "requires_action", "succeeded", "failed", "canceled"}:
        raise HTTPException(400, "Unsupported refund status.")
    metadata = refund.get("metadata") or {}
    operation_id = metadata.get("ponyo_operation_id") if isinstance(metadata, Mapping) else None
    row = await db.scalar(select(PaymentTransaction).where(
        PaymentTransaction.order_id == order.id, PaymentTransaction.kind == "refund",
        PaymentTransaction.provider_reference == identifier,
    ))
    if row is None and operation_id:
        from uuid import UUID
        try:
            row = await db.get(PaymentTransaction, UUID(operation_id))
        except (TypeError, ValueError):
            raise HTTPException(400, "Invalid refund operation identity.") from None
        if row and (row.order_id != order.id or row.kind != "refund" or row.amount != amount
                    or row.provider_reference not in {None, identifier}):
            raise HTTPException(400, "Refund operation does not match the order.")
    if row is None:
        row = await record_transaction(db, order, kind="refund", status="pending", amount=amount,
                                       reference=identifier, key=f"refund:{identifier}")
    if row.amount != amount:
        raise HTTPException(400, "Refund amount changed unexpectedly.")
    previous_status = row.status
    if row.status == "succeeded":
        return row
    # Do not regress a terminal refund from a delayed pending event.
    if row.status in {"failed", "canceled"} and status in {"pending", "requires_action"}:
        return row
    row.provider_reference = identifier
    row.status = status
    row.error_code = str(refund.get("failure_reason") or "")[:80] or None
    await db.flush()
    refunded = await db.scalar(select(func.coalesce(func.sum(PaymentTransaction.amount), 0)).where(
        PaymentTransaction.order_id == order.id, PaymentTransaction.kind == "refund", PaymentTransaction.status == "succeeded",
    )) or 0
    if refunded > order.captured_amount:
        raise HTTPException(400, "Refund total exceeds captured payment.")
    order.refunded_amount = refunded
    if refunded:
        order.payment_status = "refunded" if refunded == order.captured_amount else "partially_refunded"
    if status in {"succeeded", "failed", "canceled"} and previous_status != status:
        event = OutboxEvent(event_type=f"payment.refund_{status}", payload={"orderId": str(order.id), "refundId": identifier, "amount": amount})
        db.add(event)
        if status == "succeeded":
            enqueue_email_notification(
                db, event, template="refund_notification", recipient=order.customer_email,
                payload={"orderNumber": order.order_number, "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                         "refundId": identifier, "amount": amount, "currency": order.currency},
            )
    return row
