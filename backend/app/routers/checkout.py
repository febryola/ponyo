from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import uuid4

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.currency import SUPPORTED_CURRENCIES, convert_minor_amount, get_jpy_rates
from app.db import get_db
from app.models import Customer, Order, OrderItem, ProductVariant
from app.media import storefront_image_url
from app.rate_limit import enforce_rate_limit
from app.schemas import CheckoutReceiptOut, CheckoutSessionRequest
from app.security import get_optional_customer, require_csrf

router = APIRouter(prefix="/checkout", tags=["checkout"])

SHIPPING_PRICES = {"standard": 0, "express": 1200}
SUPPORTED_COUNTRIES = {"JP", "US", "GB", "AU", "CA"}


@router.get("/sessions/{session_id}", response_model=dict)
async def get_checkout_receipt(session_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    if not session_id.startswith("cs_") or len(session_id) > 255:
        raise HTTPException(status_code=404, detail="Checkout receipt not found.")
    await enforce_rate_limit(request, "checkout-receipt", 30, 60)
    order = await db.scalar(select(Order).where(Order.stripe_session_id == session_id))
    if not order:
        raise HTTPException(status_code=404, detail="Checkout receipt is not available yet.")
    receipt = CheckoutReceiptOut(
        orderId=order.id,
        orderNumber=order.order_number,
        status=order.status,
        paymentStatus=order.payment_status,
        fulfillmentStatus=order.fulfillment_status,
        totalAmount=order.total_amount,
        currency=order.currency,
    )
    return {"data": receipt.model_dump(mode="json")}


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
    target_currency = payload.currency.upper()
    if target_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=422, detail="Choose a supported display currency.")
    if payload.shippingAddress.countryCode not in SUPPORTED_COUNTRIES:
        raise HTTPException(status_code=422, detail="Shipping is not available for the selected country yet.")

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
    source_currency = next(iter(currencies)).upper()
    try:
        rates = await get_jpy_rates() if target_currency != source_currency else {"base": source_currency, "rates": {source_currency: 1}}
        converted_prices = {
            variant.id: convert_minor_amount(variant.price_amount, variant.currency, target_currency, rates)
            for variant in variant_by_id.values()
        }
        converted_shipping = convert_minor_amount(shipping_price, source_currency, target_currency, rates)
    except Exception:
        raise HTTPException(status_code=503, detail="Currency conversion is temporarily unavailable. Please retry or select JPY.") from None

    for requested in payload.items:
        variant = variant_by_id[requested.variantId]
        if not variant.product.published or variant.stock_quantity < requested.quantity:
            raise HTTPException(status_code=409, detail="One or more items are no longer available in that quantity.")

    currency = target_currency.lower()
    item_total = sum(converted_prices[item.variantId] * item.quantity for item in payload.items)
    total = item_total + converted_shipping
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
    line_items = []
    for requested in payload.items:
        variant = variant_by_id[requested.variantId]
        variant.stock_quantity -= requested.quantity
        line_items.append({
            "quantity": requested.quantity,
            "price_data": {
                "currency": currency,
                "unit_amount": converted_prices[variant.id],
                "product_data": {
                    "name": variant.product.name,
                    "images": [f"{settings.storefront_base_url.rstrip('/')}{storefront_image_url(variant.product.image_url)}"] if settings.storefront_base_url.startswith("https://") else [],
                },
            },
        })
        order.items.append(OrderItem(
            variant_id=variant.id,
            product_name=variant.product.name,
            supplier_name=variant.product.supplier_name,
            image_url=storefront_image_url(variant.product.image_url),
            image_alt=variant.product.image_alt,
            quantity=requested.quantity,
            unit_price=converted_prices[variant.id],
            currency=currency.upper(),
        ))
    db.add(order)
    stripe.api_key = settings.stripe_secret_key
    if shipping_price:
        line_items.append({"quantity": 1, "price_data": {"currency": currency, "unit_amount": converted_shipping, "product_data": {"name": "Express delivery"}}})
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
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        try:
            stripe.checkout.Session.expire(session.id)
        except stripe.StripeError:
            pass
        raise HTTPException(status_code=503, detail="Checkout could not be saved securely. Please try again.") from None
    return {"data": {"checkoutUrl": session.url, "orderId": str(order.id), "expiresAt": datetime.fromtimestamp(session.expires_at, timezone.utc).isoformat()}}


