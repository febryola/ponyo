"""Supplier-isolated purchase orders and trusted admin routing controls."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_db
from app.models import Customer, Supplier, SupplierAccount, SupplierPurchaseOrder
from app.rate_limit import enforce_rate_limit
from app.schemas import SupplierAccountRequest, SupplierDecisionRequest
from app.security import require_csrf, require_roles
from app.supplier_orders import (confirm_purchase_order, generate_purchase_orders, load_order,
                                 load_purchase_order, now_utc, purchase_order_payload, refresh_fulfillment)

router = APIRouter(prefix="/supplier-orders", tags=["supplier fulfillment"])


async def scoped_supplier(db: AsyncSession, actor: Customer) -> UUID | None:
    if actor.role == "admin":
        return None
    binding = await db.get(SupplierAccount, actor.id)
    supplier = await db.get(Supplier, binding.supplier_id) if binding else None
    if not supplier or not supplier.active:
        raise HTTPException(403, "Your account has no active supplier assignment.")
    return supplier.id


async def visible_po(db: AsyncSession, po_id: UUID, actor: Customer):
    supplier_id = await scoped_supplier(db, actor)
    query = select(SupplierPurchaseOrder).where(SupplierPurchaseOrder.id == po_id)
    if supplier_id:
        query = query.where(SupplierPurchaseOrder.supplier_id == supplier_id)
    po = await db.scalar(query.options(selectinload(SupplierPurchaseOrder.items)))
    if not po:
        raise HTTPException(404, "Supplier purchase order not found.")
    return po


@router.get("", response_model=dict)
async def list_purchase_orders(actor: Customer = Depends(require_roles("supplier", "admin")),
                               db: AsyncSession = Depends(get_db), limit: int = Query(default=50, ge=1, le=100),
                               offset: int = Query(default=0, ge=0)):
    supplier_id = await scoped_supplier(db, actor)
    query = select(SupplierPurchaseOrder).options(selectinload(SupplierPurchaseOrder.items))
    if supplier_id:
        query = query.where(SupplierPurchaseOrder.supplier_id == supplier_id)
    rows = await db.scalars(query.order_by(SupplierPurchaseOrder.created_at.desc(), SupplierPurchaseOrder.id).offset(offset).limit(limit))
    return {"data": [purchase_order_payload(po) for po in rows]}


@router.post("/suppliers/{supplier_id}/accounts", response_model=dict)
async def link_supplier_account(supplier_id: UUID, payload: SupplierAccountRequest, request: Request,
                                _admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    supplier = await db.get(Supplier, supplier_id)
    customer = await db.scalar(select(Customer).where(Customer.id == payload.customerId).with_for_update())
    if not supplier or not supplier.active:
        raise HTTPException(404, "Supplier not found.")
    if not customer or customer.role != "supplier" or not customer.email_verified:
        raise HTTPException(422, "Choose an existing verified supplier-role account.")
    binding = await db.get(SupplierAccount, customer.id)
    if binding and binding.supplier_id != supplier_id:
        raise HTTPException(409, "This account is already assigned to a different supplier.")
    if not binding:
        db.add(SupplierAccount(customer_id=customer.id, supplier_id=supplier_id))
    await db.commit()
    return {"data": {"customerId": str(customer.id), "supplierId": str(supplier_id)}}


@router.post("/orders/{order_id}/plan", response_model=dict)
async def plan_supplier_orders(order_id: UUID, request: Request, _admin: Customer = Depends(require_roles("admin")),
                               db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "supplier-plan", 20, 60)
    order = await load_order(db, order_id)
    if order is None:
        raise HTTPException(404, "Order not found.")
    created = await generate_purchase_orders(db, order)
    await db.commit()
    return {"data": {"orderId": str(order.id), "fulfillmentStatus": order.fulfillment_status,
                     "createdPurchaseOrders": [purchase_order_payload(po) for po in created]}}


@router.get("/{po_id}", response_model=dict)
async def get_purchase_order(po_id: UUID, actor: Customer = Depends(require_roles("supplier", "admin")), db: AsyncSession = Depends(get_db)):
    po = await visible_po(db, po_id, actor)
    # Only the assigned supplier/admin can access the delivery address.
    return {"data": purchase_order_payload(po, forwarding=True)}


@router.post("/{po_id}/confirmation", response_model=dict)
async def supplier_confirmation(po_id: UUID, payload: SupplierDecisionRequest, request: Request,
                                actor: Customer = Depends(require_roles("supplier", "admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "supplier-confirmation", 30, 60)
    visible = await visible_po(db, po_id, actor)
    order = await load_order(db, visible.order_id)
    po = await load_purchase_order(db, po_id)
    await confirm_purchase_order(db, order, po, event_id=str(payload.eventId), decision=payload.decision,
                                  supplier_order_id=payload.supplierOrderId, reason=payload.reason)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Confirmation is already being applied. Retry with the same event ID.") from None
    return {"data": purchase_order_payload(po)}


@router.post("/{po_id}/retry", response_model=dict)
async def retry_purchase_order(po_id: UUID, request: Request, admin: Customer = Depends(require_roles("admin")),
                               db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "supplier-retry", 10, 60)
    visible = await visible_po(db, po_id, admin)
    order = await load_order(db, visible.order_id)
    po = await load_purchase_order(db, po_id)
    if order.payment_status != "paid" or order.status != "processing":
        raise HTTPException(409, "Only paid processing orders can be retried.")
    if po.status not in {"retry", "unknown", "manual_review"}:
        raise HTTPException(409, "This purchase order is not awaiting retry.")
    if po.attempts >= settings.supplier_max_attempts:
        raise HTTPException(409, "Retry budget exhausted. Reconcile this exact supplier PO before any further action.")
    po.status, po.next_attempt_at, po.lease_until, po.last_error = "retry", now_utc(), None, None
    await refresh_fulfillment(db, order)
    await db.commit()
    return {"data": purchase_order_payload(po)}
