"""Recover missed expiry webhooks only after Stripe confirms expired/unpaid.

The local deadline selects candidates; it is never evidence of non-payment.
Provider calls run without database locks, then each order is rechecked and
settled in its own transaction, sharing the webhook's order lock.
"""

import asyncio
import logging
from collections.abc import Callable, Mapping
from datetime import datetime, timezone

import stripe
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import SessionLocal
from app.config import settings
from app.email_queue import enqueue_email_notification
from app.inventory import restore_variant_stock, settle_supplier_stock
from app.models import Order, OrderItem, OrderStatusHistory, OutboxEvent, ProductVariant
from app.payments import record_transaction

logger = logging.getLogger("ponyo.reservation_expiry")
BATCH_SIZE = 100
POLL_INTERVAL = 60


def provider_status(session_id: str) -> Mapping:
    """Synchronous Stripe lookup/expiry, invoked in a thread by the sweeper."""
    stripe.api_key = settings.stripe_secret_key
    session = stripe.checkout.Session.retrieve(session_id)
    if (isinstance(session, Mapping) and session.get("id") == session_id
            and session.get("status") == "open" and session.get("payment_status") == "unpaid"):
        session = stripe.checkout.Session.expire(session_id)
    return session


def _confirmed_expired(session, session_id: str, order_id) -> bool:
    if not isinstance(session, Mapping):
        return False
    if (session.get("id") != session_id or session.get("status") != "expired"
            or session.get("payment_status") != "unpaid"):
        return False
    # Stored provider ID is sufficient, but reject contradictory references.
    metadata = session.get("metadata")
    if metadata is not None and not isinstance(metadata, Mapping):
        return False
    reference = (metadata or {}).get("ponyo_order_id")
    client_reference = session.get("client_reference_id")
    return all(value is None or value == str(order_id) for value in (reference, client_reference))


async def expire_reservations(
    db: AsyncSession,
    now: datetime | None = None,
    provider: Callable[[str], Mapping] | None = None,
) -> int:
    """Use a dedicated injected session; commit/rollback separately per order."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    eligible = (
        Order.status == "pending_payment", Order.payment_status == "unpaid",
        Order.payment_provider == "stripe", Order.reservation_expires_at <= now,
    )
    candidates = (await db.execute(
        select(Order.id, Order.stripe_session_id, Order.reservation_expires_at)
        .where(*eligible).order_by(Order.reservation_expires_at, Order.id).limit(BATCH_SIZE)
    )).all()
    # End the scan transaction before contacting Stripe (no long-lived snapshot).
    await db.rollback()
    released = 0
    for order_id, session_id, _deadline in candidates:
        try:
            if session_id is None:
                # The checkout URL is not returned until its session ID is committed.
                # Therefore a session-less reservation cannot be used by a customer
                # and can be released after its saved provider expiry deadline.
                order = await db.scalar(select(Order).where(
                    Order.id == order_id, *eligible, Order.stripe_session_id.is_(None),
                ).with_for_update().execution_options(populate_existing=True))
                if order is None:
                    await db.rollback()
                    continue
                result = await db.execute(update(Order).where(
                    Order.id == order_id, *eligible, Order.stripe_session_id.is_(None),
                ).values(status="cancelled", payment_status="failed").execution_options(synchronize_session=False))
                if result.rowcount != 1:
                    await db.rollback()
                    continue
                items = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order_id))).all()
                variant_ids = {item.variant_id for item in items}
                locked_ids = set((await db.scalars(
                    select(ProductVariant.id).where(ProductVariant.id.in_(variant_ids))
                    .order_by(ProductVariant.id).with_for_update()
                )).all())
                if locked_ids != variant_ids:
                    raise RuntimeError("Reservation variant is unavailable")
                for item in sorted(items, key=lambda item: item.variant_id):
                    await settle_supplier_stock(db, item, paid=False)
                    await restore_variant_stock(db, item)
                db.add(OrderStatusHistory(
                    order_id=order_id, from_status="pending_payment", to_status="cancelled",
                    payment_status="failed", fulfillment_status=order.fulfillment_status,
                    source="reservation_expiry", event_key=f"checkout.session_missing:{order_id}",
                ))
                await record_transaction(db, order, kind="void", status="succeeded", amount=order.total_amount,
                                         reference=None, key=f"void:{order.id}")
                event = OutboxEvent(event_type="order.reservation_expired",
                                    payload={"orderId": str(order_id), "orderNumber": order.order_number})
                enqueue_email_notification(
                    db, event, template="cancellation_notification", recipient=order.customer_email,
                    payload={"orderNumber": order.order_number,
                             "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                             "reason": "Checkout payment was not completed before it expired."},
                )
                await db.commit()
                released += 1
                continue
            session = await asyncio.to_thread(provider or provider_status, session_id)
            if not _confirmed_expired(session, session_id, order_id):
                continue
            order = await db.scalar(
                select(Order).where(Order.id == order_id, *eligible, Order.stripe_session_id == session_id)
                .with_for_update().execution_options(populate_existing=True)
            )
            if order is None:
                await db.rollback()
                continue
            result = await db.execute(
                update(Order).where(Order.id == order_id, *eligible, Order.stripe_session_id == session_id)
                .values(status="cancelled", payment_status="failed")
                .execution_options(synchronize_session=False)
            )
            if result.rowcount != 1:
                await db.rollback()
                continue
            items = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order_id))).all()
            variant_ids = {item.variant_id for item in items}
            locked_ids = set((await db.scalars(
                select(ProductVariant.id).where(ProductVariant.id.in_(variant_ids))
                .order_by(ProductVariant.id).with_for_update()
            )).all())
            if locked_ids != variant_ids:
                raise RuntimeError("Reservation variant is unavailable")
            # Lock all variants before taking supplier locks, like checkout.
            for item in sorted(items, key=lambda item: item.variant_id):
                await settle_supplier_stock(db, item, paid=False)
                await restore_variant_stock(db, item)
            db.add(OrderStatusHistory(
                order_id=order_id, from_status="pending_payment", to_status="cancelled",
                payment_status="failed", fulfillment_status=order.fulfillment_status,
                source="reservation_expiry", event_key=f"reservation.expired:{order_id}",
            ))
            await record_transaction(db, order, kind="void", status="succeeded", amount=order.total_amount,
                                     reference=session_id, key=f"void:{order.id}")
            event = OutboxEvent(
                event_type="order.reservation_expired",
                payload={"orderId": str(order_id), "orderNumber": order.order_number},
            )
            enqueue_email_notification(
                db, event, template="cancellation_notification", recipient=order.customer_email,
                payload={"orderNumber": order.order_number,
                         "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                         "reason": "Checkout payment was not completed before it expired."},
            )
            await db.commit()
            released += 1
        except Exception as error:
            await db.rollback()
            logger.warning("Reservation recovery skipped exception_type=%s", type(error).__name__)
    return released


async def recover_expired_reservations(session_factory=SessionLocal) -> None:
    """Optional lifespan worker; cancellation closes its dedicated session."""
    while True:
        try:
            async with session_factory() as db:
                await expire_reservations(db)
        except Exception as error:
            logger.warning("Reservation recovery retry exception_type=%s", type(error).__name__)
        await asyncio.sleep(POLL_INTERVAL)