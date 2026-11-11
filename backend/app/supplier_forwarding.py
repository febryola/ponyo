"""Opt-in supplier PO delivery with durable leases and stable provider keys."""

import asyncio
import json
import logging
from datetime import timedelta
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import SessionLocal
from app.models import Order, Supplier, SupplierPurchaseOrder
from app.supplier_orders import (aware, confirm_purchase_order, generate_purchase_orders, load_order,
                                 load_purchase_order, now_utc, purchase_order_payload,
                                 refresh_fulfillment, retry_delay)

logger = logging.getLogger("ponyo.supplier_forwarding")


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward a supplier token or customer address to another host.


def send_purchase_order(integration: dict, payload: dict) -> dict:
    request = Request(integration["url"], data=json.dumps(payload, separators=(",", ":")).encode(), method="POST",
                      headers={"Authorization": f"Bearer {integration['token']}", "Content-Type": "application/json",
                               "Idempotency-Key": payload["idempotencyKey"], "User-Agent": "Ponyo-Supplier/1.0"})
    # Endpoint contract MUST deduplicate the stable key; HTTP errors are not
    # interpreted as rejection because a proxy can fail after acceptance.
    with build_opener(NoRedirects()).open(request, timeout=10) as response:
        raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError("supplier_response_too_large")
        result = json.loads(raw)
    if (not isinstance(result, dict) or result.get("idempotencyKey") != payload["idempotencyKey"]
            or result.get("status") not in {"accepted", "confirmed", "rejected"}):
        raise ValueError("supplier_response_invalid")
    identifier = result.get("supplierOrderId")
    if result["status"] in {"accepted", "confirmed"} and (not isinstance(identifier, str) or not identifier or len(identifier) > 180):
        raise ValueError("supplier_order_reference_invalid")
    if result.get("reason") is not None and (not isinstance(result["reason"], str) or len(result["reason"]) > 500):
        raise ValueError("supplier_rejection_reason_invalid")
    return result


async def claim_delivery(db: AsyncSession, po_id: UUID):
    parent_id = await db.scalar(select(SupplierPurchaseOrder.order_id).where(SupplierPurchaseOrder.id == po_id))
    if parent_id is None:
        return None
    order = await load_order(db, parent_id)
    po = await load_purchase_order(db, po_id)
    if not order or not po or po.status in {"confirmed", "rejected", "submitted", "manual_review"}:
        return None
    now = now_utc()
    if (po.next_attempt_at and aware(po.next_attempt_at) > now) or (po.lease_until and aware(po.lease_until) > now):
        return None
    if order.payment_status != "paid" or order.status != "processing":
        po.status, po.last_error = "manual_review", "order_not_paid_or_processing"
        await refresh_fulfillment(db, order)
        return None
    supplier = await db.get(Supplier, po.supplier_id)
    integration = settings.supplier_integrations.get(supplier.code) if supplier else None
    if not supplier or not supplier.active or supplier.is_demo or not integration:
        po.status, po.last_error = "manual_review", "supplier_integration_unavailable"
        await refresh_fulfillment(db, order)
        return None
    if po.attempts >= settings.supplier_max_attempts:
        po.status, po.last_error = "manual_review", "retry_limit_reached"
        await refresh_fulfillment(db, order)
        return None
    # Atomic lease claim backs up Postgres row locks and protects duplicate worker scans.
    claim = await db.execute(update(SupplierPurchaseOrder).where(
        SupplierPurchaseOrder.id == po.id, SupplierPurchaseOrder.status.in_(["pending", "retry", "unknown", "dispatching"]),
        or_(SupplierPurchaseOrder.lease_until.is_(None), SupplierPurchaseOrder.lease_until <= now),
    ).values(status="dispatching", lease_until=now + timedelta(seconds=60), attempts=SupplierPurchaseOrder.attempts + 1)
        .execution_options(synchronize_session=False))
    if claim.rowcount != 1:
        return None
    po.status, po.lease_until, po.attempts = "dispatching", now + timedelta(seconds=60), po.attempts + 1
    payload = purchase_order_payload(po, forwarding=True)
    return dict(integration), payload, parent_id, po.attempts


async def dispatch_purchase_order(session_factory, po_id: UUID, transport=send_purchase_order) -> bool:
    if not settings.supplier_forwarding_enabled:
        return False
    async with session_factory() as db:
        claimed = await claim_delivery(db, po_id)
        await db.commit()  # Durable claim BEFORE the external side effect.
    if claimed is None:
        return False
    integration, payload, order_id, claimed_attempt = claimed
    try:
        result = await asyncio.to_thread(transport, integration, payload)
        # Test/custom transports must obey the same contract as the HTTP adapter.
        if (not isinstance(result, dict) or result.get("idempotencyKey") != payload["idempotencyKey"]
                or result.get("status") not in {"accepted", "confirmed", "rejected"}):
            raise ValueError("supplier_response_invalid")
        if result["status"] in {"accepted", "confirmed"} and not result.get("supplierOrderId"):
            raise ValueError("supplier_order_reference_invalid")
        error = None
    except Exception as exc:
        result, error = None, type(exc).__name__
    async with session_factory() as db:
        order = await load_order(db, order_id)
        po = await load_purchase_order(db, po_id)
        if not order or not po:
            return False
        if po.status in {"confirmed", "rejected"}:
            return True  # A signed-in supplier confirmed while transport was in flight.
        if po.attempts != claimed_attempt:
            return False  # Ignore stale responses from an expired/reclaimed worker lease.
        po.lease_until = None
        if not error and (order.payment_status != "paid" or order.status != "processing"):
            po.status, po.last_error, po.next_attempt_at = "manual_review", "order_changed_after_forwarding", None
            po.supplier_order_id = result.get("supplierOrderId") or po.supplier_order_id
            await refresh_fulfillment(db, order)
            await db.commit()
            return False
        if error:
            po.status = "manual_review" if po.attempts >= settings.supplier_max_attempts else "unknown"
            po.last_error = error[:100]
            po.next_attempt_at = None if po.status == "manual_review" else now_utc() + retry_delay(po.attempts)
            # Never reroute uncertain delivery: retry the exact PO with the same stable key.
            await refresh_fulfillment(db, order)
        elif result["status"] == "accepted":
            po.supplier_order_id = result["supplierOrderId"]
            if order.payment_status != "paid" or order.status != "processing":
                po.status, po.last_error, po.next_attempt_at = "manual_review", "order_changed_after_forwarding", None
                await refresh_fulfillment(db, order)
            else:
                po.status, po.last_error = "submitted", None
                po.next_attempt_at = now_utc() + timedelta(seconds=settings.supplier_confirmation_timeout_seconds)
        else:
            await confirm_purchase_order(db, order, po, event_id=f"forward:{po.id}:{result['status']}",
                                          decision=result["status"], supplier_order_id=result.get("supplierOrderId"),
                                          reason=result.get("reason"))
        await db.commit()
    return error is None


async def run_supplier_iteration(session_factory=SessionLocal, transport=send_purchase_order) -> int:
    if not settings.supplier_forwarding_enabled:
        return 0
    now = now_utc()
    async with session_factory() as db:
        has_po = select(SupplierPurchaseOrder.id).where(SupplierPurchaseOrder.order_id == Order.id).exists()
        ids = list(await db.scalars(select(Order.id).where(
            Order.payment_status == "paid", Order.status == "processing",
            or_(~has_po, (Order.fulfillment_status == "on_hold") & (Order.supplier_retry_at <= now)),
            or_(Order.supplier_retry_at.is_(None), Order.supplier_retry_at <= now),
            Order.supplier_retry_count < settings.supplier_max_attempts,
        ).order_by(Order.created_at, Order.id).limit(25)))
    for order_id in ids:
        async with session_factory() as db:
            order = await load_order(db, order_id)
            if order and order.payment_status == "paid" and order.status == "processing":
                await generate_purchase_orders(db, order)
                await db.commit()
    async with session_factory() as db:
        # Silence is ambiguous, not rejection: move overdue accepted POs to review.
        expired_ids = list(await db.scalars(select(SupplierPurchaseOrder.id).where(
            SupplierPurchaseOrder.status == "submitted", SupplierPurchaseOrder.next_attempt_at <= now,
        ).limit(25)))
    for po_id in expired_ids:
        async with session_factory() as db:
            parent = await db.scalar(select(SupplierPurchaseOrder.order_id).where(SupplierPurchaseOrder.id == po_id))
            order = await load_order(db, parent)
            po = await load_purchase_order(db, po_id)
            if po and po.status == "submitted" and po.next_attempt_at and aware(po.next_attempt_at) <= now:
                po.status, po.last_error, po.next_attempt_at = "manual_review", "confirmation_timeout", None
                await refresh_fulfillment(db, order)
                await db.commit()
    async with session_factory() as db:
        ids = list(await db.scalars(select(SupplierPurchaseOrder.id).where(
            SupplierPurchaseOrder.status.in_(["pending", "retry", "unknown", "dispatching"]),
            or_(SupplierPurchaseOrder.next_attempt_at.is_(None), SupplierPurchaseOrder.next_attempt_at <= now),
            or_(SupplierPurchaseOrder.lease_until.is_(None), SupplierPurchaseOrder.lease_until <= now),
        ).order_by(SupplierPurchaseOrder.created_at, SupplierPurchaseOrder.id).limit(25)))
    delivered = 0
    for po_id in ids:
        try:
            delivered += int(await dispatch_purchase_order(session_factory, po_id, transport))
        except Exception as error:
            # Do not log addresses, credentials or provider response bodies.
            logger.warning("Supplier dispatch retry exception_type=%s", type(error).__name__)
    return delivered


async def supplier_order_worker(session_factory=SessionLocal) -> None:
    while True:
        try:
            await run_supplier_iteration(session_factory)
        except Exception as error:
            logger.warning("Supplier iteration retry exception_type=%s", type(error).__name__)
        await asyncio.sleep(5)
