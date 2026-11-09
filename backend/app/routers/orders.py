from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.media import storefront_image_url
from app.models import Customer, Order
from app.security import get_current_customer

router = APIRouter(prefix="/orders", tags=["orders"])


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
        "fulfillmentStatus": order.fulfillment_status,
        "customerEmail": order.customer_email,
        "deliveryAddress": address_text,
        "trackingNumber": order.tracking_number,
        "trackingCarrier": order.tracking_carrier,
        "totalAmount": order.total_amount,
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
            }
            for item in order.items
        ],
    }


@router.get("", response_model=dict)
async def list_orders(customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    orders = await db.scalars(
        select(Order)
        .where((Order.customer_id == customer.id) | (Order.customer_email == customer.email))
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )
    return {"data": [order_payload(order) for order in orders]}


@router.get("/{order_id}", response_model=dict)
async def get_order(order_id: UUID, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    order = await db.scalar(
        select(Order)
        .where(Order.id == order_id, (Order.customer_id == customer.id) | (Order.customer_email == customer.email))
        .options(selectinload(Order.items))
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return {"data": order_payload(order)}
