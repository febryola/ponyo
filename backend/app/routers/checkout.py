from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import uuid4

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_db
from app.models import Customer, Order, OrderItem, ProductVariant
from app.schemas import CheckoutSessionRequest
from app.security import get_optional_customer, require_csrf

router = APIRouter(prefix="/checkout", tags=["checkout"])

SHIPPING_PRICES = {"standard": 0, "express": 1200}


def valid_storefront_url(value: str) -> str:
    parsed = urlparse(value)
    allowed = {urlparse(origin).netloc for origin in settings.cors_origins if urlparse(origin).scheme == parsed.scheme}
    if parsed.scheme != "https" and settings.environment != "local":
        raise HTTPException(status_code=422, detail="Checkout return URLs must use HTTPS.")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.netloc not in allowed:
        raise HTTPException(status_code=422, detail="Checkout return URL must use an allowed storefront origin.")
    return value


@router.post("/sessions", response_model=dict)
async def create_checkout_session(
    payload: CheckoutSessionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    customer: Customer | None = Depends(get_optional_customer),
):
    require_csrf(request)
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Secure checkout is not configured yet.")
    shipping_price = SHIPPING_PRICES.get(payload.shippingMethod)
    if shipping_price is None:
        raise HTTPException(status_code=422, detail="Choose a supported shipping method.")
    success_url = valid_storefront_url(payload.successUrl)
    cancel_url = valid_storefront_url(payload.cancelUrl)
    if payload.paymentMethod == "paypal":
        raise HTTPException(status_code=422, detail="PayPal is not enabled for this Stripe account yet. Choose card or Apple Pay.")

    variant_ids = [item.variantId for item in payload.items]
    if len(set(variant_ids)) != len(variant_ids):
        raise HTTPException(status_code=422, detail="Each product variant can appear only once in checkout.")
    variants = await db.scalars(
        select(ProductVariant)
        .where(ProductVariant.id.in_(variant_ids), ProductVariant.active.is_(True))
        .options(selectinload(ProductVariant.product))
        .with_for_update()
    )
    variant_by_id = {variant.id: variant for variant in variants}
    if len(variant_by_id) != len(variant_ids):
        raise HTTPException(status_code=409, detail="One or more items are no longer available.")
    currencies = {variant.currency.lower() for variant in variant_by_id.values()}
    if len(currencies) != 1:
        raise HTTPException(status_code=422, detail="All items in one order must use the same currency.")

    for requested in payload.items:
        variant = variant_by_id[requested.variantId]
        if not variant.product.published or variant.stock_quantity < requested.quantity:
            raise HTTPException(status_code=409, detail="One or more items are no longer available in that quantity.")

    currency = next(iter(currencies))
    item_total = sum(variant_by_id[item.variantId].price_amount * item.quantity for item in payload.items)
    total = item_total + shipping_price
    order_id = uuid4()
    order_number = f"PNY-{datetime.now(timezone.utc):%y%m%d}-{str(order_id).split('-')[0].upper()}"
    address = payload.shippingAddress.model_dump()
    order = Order(
        id=order_id,
        order_number=order_number,
        customer_id=customer.id if customer else None,
        customer_email=str(payload.email).lower().strip(),
        status="pending_payment",
        payment_status="unpaid",
        fulfillment_status="unfulfilled",
        total_amount=total,
        currency=currency.upper(),
        shipping_address=address,
        shipping_method=payload.shippingMethod,
        payment_method=payload.paymentMethod,
        payment_provider="stripe",
    )
    for requested in payload.items:
        variant = variant_by_id[requested.variantId]
        variant.stock_quantity -= requested.quantity
        order.items.append(OrderItem(
            variant_id=variant.id,
            product_name=variant.product.name,
            supplier_name=variant.product.supplier_name,
            image_url=variant.product.image_url,
            image_alt=variant.product.image_alt,
            quantity=requested.quantity,
            unit_price=variant.price_amount,
            currency=variant.currency,
        ))
    db.add(order)
    stripe.api_key = settings.stripe_secret_key
    line_items = [
        {
            "quantity": item.quantity,
            "price_data": {
                "currency": item.currency.lower(),
                "unit_amount": item.unit_price,
                "product_data": {"name": item.product_name, "images": [item.image_url] if item.image_url.startswith("https://") else []},
            },
        }
        for item in order.items
    ]
    if shipping_price:
        line_items.append({"quantity": 1, "price_data": {"currency": currency, "unit_amount": shipping_price, "product_data": {"name": "Express delivery"}}})
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            customer_email=str(payload.email),
            line_items=line_items,
            success_url=success_url,
            cancel_url=cancel_url,
            expires_at=int((datetime.now(timezone.utc) + timedelta(minutes=30)).timestamp()),
            client_reference_id=str(order.id),
            metadata={"ponyo_order_id": str(order.id)},
            idempotency_key=f"ponyo-checkout-{order.id}",
        )
    except stripe.StripeError:
        await db.rollback()
        raise HTTPException(status_code=503, detail="The payment provider could not start checkout. Please try again.") from None

    order.stripe_session_id = session.id
    db.add(order)
    await db.commit()
    return {"data": {"checkoutUrl": session.url, "orderId": str(order.id), "expiresAt": datetime.fromtimestamp(session.expires_at, timezone.utc).isoformat()}}


