import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from uuid import uuid4

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.currency import SUPPORTED_CURRENCIES, convert_minor_amount, get_jpy_rates
from app.checkout_pricing import allocate_discount, coupon_discount, totals
from app.catalog_stock import available_quantities
from app.db import get_db
from app.models import Coupon, Customer, Order, OrderItem, OrderStatusHistory, PaymentTransaction, ProductVariant
from app.payments import record_transaction, reference_id
from app.inventory import reserve_supplier_stock
from app.media import storefront_image_url
from app.rate_limit import enforce_rate_limit
from app.schemas import CheckoutReceiptOut, CheckoutSessionRequest
from app.security import get_current_customer, require_csrf

router = APIRouter(prefix="/checkout", tags=["checkout"])

SHIPPING_PRICES = {"standard": 0, "express": 1200}
SUPPORTED_COUNTRIES = {"JP", "KR", "US", "GB", "AU", "CA"}


async def checkout_values(payload: CheckoutSessionRequest, customer: Customer, db: AsyncSession, *, lock: bool):
    if str(payload.email).lower().strip() != customer.email.lower():
        raise HTTPException(422, "Use your verified account email for checkout.")
    shipping_price = {"standard": settings.checkout_standard_shipping_jpy,
                      "express": settings.checkout_express_shipping_jpy}.get(payload.shippingMethod)
    if shipping_price is None:
        raise HTTPException(422, "Choose a supported shipping method.")
    valid_storefront_url(payload.successUrl)
    valid_storefront_url(payload.cancelUrl)
    if payload.paymentMethod == "paypal":
        raise HTTPException(422, "PayPal is not enabled for this Stripe account yet. Choose card or Apple Pay.")
    target_currency = payload.currency.upper()
    if target_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(422, "Choose a supported display currency.")
    if payload.shippingAddress.countryCode not in SUPPORTED_COUNTRIES:
        raise HTTPException(422, "Shipping is not available for the selected country yet.")
    variant_ids = [item.variantId for item in payload.items]
    if len(set(variant_ids)) != len(variant_ids):
        raise HTTPException(422, "Each product variant can appear only once in checkout.")
    query = (select(ProductVariant).where(ProductVariant.id.in_(variant_ids), ProductVariant.active.is_(True))
             .options(selectinload(ProductVariant.product)).order_by(ProductVariant.id))
    if lock:
        query = query.with_for_update()
    variants = {variant.id: variant for variant in await db.scalars(query)}
    if len(variants) != len(variant_ids):
        raise HTTPException(409, "One or more items are no longer available.")
    currencies = {variant.currency.upper() for variant in variants.values()}
    if len(currencies) != 1:
        raise HTTPException(422, "All items in one order must use the same currency.")
    available = await available_quantities(db, variants.values()) if not lock else None
    for requested in payload.items:
        variant = variants[requested.variantId]
        if not variant.product.published or (available.get(variant.id, 0) if available is not None else variant.stock_quantity) < requested.quantity:
            raise HTTPException(409, "One or more items are no longer available in that quantity.")
        if (requested.expectedPriceAmount is not None and requested.expectedPriceAmount != variant.price_amount) or (
            requested.expectedCurrency is not None and requested.expectedCurrency.upper() != variant.currency.upper()
        ):
            raise HTTPException(409, detail={"code": "cart_price_changed", "message": "Prices changed. Review your cart before starting payment."})
    coupon_currency = target_currency
    if payload.couponCode:
        coupon_currency = await db.scalar(select(Coupon.currency).where(Coupon.code == payload.couponCode.strip().upper())) or target_currency
    try:
        needs_rates = (currencies != {target_currency} or (shipping_price and target_currency != "JPY")
                       or coupon_currency != target_currency)
        rates = await get_jpy_rates() if needs_rates else {"base": target_currency, "rates": {target_currency: 1}}
        prices = {variant.id: convert_minor_amount(variant.price_amount, variant.currency, target_currency, rates)
                  for variant in variants.values()}
        shipping = convert_minor_amount(shipping_price, "JPY", target_currency, rates) if shipping_price else 0
    except Exception:
        raise HTTPException(503, "Currency conversion is temporarily unavailable. Please retry or select JPY.") from None
    subtotal = sum(prices[item.variantId] * item.quantity for item in payload.items)
    code, discount = await coupon_discount(db, payload.couponCode, subtotal, target_currency, rates, customer.id, lock=lock)
    summary = totals(subtotal, discount, shipping, payload.shippingAddress.countryCode, target_currency, code)
    return variants, prices, summary


@router.post("/quote", response_model=dict)
async def quote_checkout(payload: CheckoutSessionRequest, request: Request,
                         db: AsyncSession = Depends(get_db), customer: Customer = Depends(get_current_customer)):
    require_csrf(request)
    await enforce_rate_limit(request, "checkout-quote", 30, 60)
    _, _, summary = await checkout_values(payload, customer, db, lock=False)
    return {"data": summary}


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


def checkout_request_fingerprint(payload: CheckoutSessionRequest) -> str:
    values = payload.model_dump(mode="json", exclude={"idempotencyKey"})
    values["email"] = str(values["email"]).lower().strip()
    canonical = json.dumps(values, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def checkout_response(order: Order, session) -> dict:
    return {"data": {
        "checkoutUrl": session.url,
        "orderId": str(order.id),
        "expiresAt": datetime.fromtimestamp(session.expires_at, timezone.utc).isoformat(),
        "subtotalAmount": order.subtotal_amount,
        "discountAmount": order.discount_amount,
        "shippingAmount": order.shipping_amount,
        "taxAmount": order.tax_amount,
        "taxRateBps": order.tax_rate_bps,
        "totalAmount": order.total_amount,
        "currency": order.currency,
        "couponCode": order.coupon_code,
    }}


def checkout_line_items(order: Order) -> list[dict]:
    lines = []
    for item in order.items:
        net_amount = item.unit_price * item.quantity - item.discount_amount
        unit_amount, extra_units = divmod(net_amount, item.quantity)
        for quantity, amount in ((item.quantity - extra_units, unit_amount), (extra_units, unit_amount + 1)):
            if quantity:
                image_url = item.image_url
                images = [f"{settings.storefront_base_url.rstrip('/')}{image_url}"] if settings.storefront_base_url.startswith("https://") else []
                lines.append({"quantity": quantity, "price_data": {
                    "currency": order.currency.lower(), "unit_amount": amount,
                    "product_data": {"name": item.product_name, "images": images},
                }})
    if order.shipping_amount:
        lines.append({"quantity": 1, "price_data": {
            "currency": order.currency.lower(), "unit_amount": order.shipping_amount,
            "product_data": {"name": f"{order.shipping_method.title()} delivery"},
        }})
    if order.tax_amount:
        lines.append({"quantity": 1, "price_data": {
            "currency": order.currency.lower(), "unit_amount": order.tax_amount,
            "product_data": {"name": "Sales tax"},
        }})
    return lines


def stripe_checkout_parameters(order: Order) -> dict:
    request_snapshot = order.checkout_request or {}
    if not order.reservation_expires_at or not request_snapshot.get("successUrl") or not request_snapshot.get("cancelUrl"):
        raise HTTPException(409, "This checkout attempt cannot be resumed. Start a new checkout.")
    expiry = order.reservation_expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    expires_at = int(expiry.timestamp())
    if expires_at <= int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=409, detail={
            "code": "checkout_session_closed", "message": "This checkout attempt expired. Start a new checkout.",
        })
    return {
        "mode": "payment", "payment_method_types": ["card"], "customer_email": order.customer_email,
        "line_items": checkout_line_items(order),
        "success_url": request_snapshot["successUrl"], "cancel_url": request_snapshot["cancelUrl"],
        "expires_at": expires_at, "client_reference_id": str(order.id),
        "metadata": {"ponyo_order_id": str(order.id)},
        "payment_intent_data": {"capture_method": order.capture_method,
                                 "metadata": {"ponyo_order_id": str(order.id)}},
        "idempotency_key": f"ponyo-checkout-{order.customer_id}-{order.checkout_idempotency_key}",
    }


async def launch_and_store_checkout_session(db: AsyncSession, order: Order):
    stripe.api_key = settings.stripe_secret_key
    parameters = stripe_checkout_parameters(order)
    try:
        session = await asyncio.to_thread(stripe.checkout.Session.create, **parameters)
    except stripe.StripeError:
        # The provider may have accepted the request before a timeout. The durable
        # order/key remain reserved so an exact retry reuses Stripe's idempotency key.
        raise HTTPException(503, "The payment provider could not confirm checkout. Retry with the same checkout request.") from None
    if not getattr(session, "id", None) or not getattr(session, "url", None) or not getattr(session, "expires_at", None):
        raise HTTPException(503, "The payment provider returned an incomplete checkout session.")
    order.stripe_session_id = session.id
    order.reservation_expires_at = datetime.fromtimestamp(session.expires_at, timezone.utc)
    intent_id = reference_id(getattr(session, "payment_intent", None))
    if intent_id:
        order.stripe_payment_intent_id = intent_id
    initiation = await db.scalar(select(PaymentTransaction).where(PaymentTransaction.event_key == f"initiation:{order.id}"))
    if initiation:
        initiation.provider_reference = session.id
    order.checkout_request = {"successUrl": parameters["success_url"], "cancelUrl": parameters["cancel_url"]}
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        # A retry can recover the same provider session from the persisted key/order.
        raise HTTPException(503, "Checkout could not be saved securely. Retry using the same checkout request.") from None
    return session


async def replay_or_resume_checkout(db: AsyncSession, order: Order) -> dict:
    if order.status != "pending_payment" or order.payment_status != "unpaid":
        raise HTTPException(status_code=409, detail={
            "code": "checkout_session_closed", "message": "This order is no longer awaiting payment.",
        })
    if order.stripe_session_id:
        stripe.api_key = settings.stripe_secret_key
        try:
            session = await asyncio.to_thread(stripe.checkout.Session.retrieve, order.stripe_session_id)
        except stripe.StripeError:
            raise HTTPException(503, "The payment provider could not confirm checkout. Please try again.") from None
        metadata = getattr(session, "metadata", None) or {}
        if (getattr(session, "id", None) != order.stripe_session_id
                or metadata.get("ponyo_order_id", str(order.id)) != str(order.id)
                or getattr(session, "amount_total", order.total_amount) != order.total_amount
                or str(getattr(session, "currency", order.currency)).upper() != order.currency):
            raise HTTPException(409, "The payment provider session does not match this order.")
        if getattr(session, "status", "open") != "open":
            raise HTTPException(status_code=409, detail={
                "code": "checkout_session_closed", "message": "This checkout session is closed. Start a new checkout.",
            })
        return checkout_response(order, session)
    session = await launch_and_store_checkout_session(db, order)
    return checkout_response(order, session)


@router.post("/sessions", response_model=dict)
async def create_checkout_session(
    payload: CheckoutSessionRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    customer: Customer = Depends(get_current_customer),
):
    require_csrf(request)
    await enforce_rate_limit(request, "checkout-session", 10, 60)
    if payload.idempotencyKey is None:
        raise HTTPException(status_code=422, detail={
            "code": "checkout_idempotency_key_required", "message": "A checkout idempotency key is required.",
        })
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Secure checkout is not configured yet.")
    fingerprint = checkout_request_fingerprint(payload)
    existing = await db.scalar(
        select(Order).where(Order.customer_id == customer.id,
                            Order.checkout_idempotency_key == str(payload.idempotencyKey))
        .options(selectinload(Order.items)).with_for_update()
    )
    if existing:
        if existing.checkout_request_hash != fingerprint:
            raise HTTPException(status_code=409, detail={
                "code": "checkout_idempotency_conflict",
                "message": "This checkout key was already used with different details. Start a new checkout.",
            })
        return await replay_or_resume_checkout(db, existing)

    variant_by_id, converted_prices, summary = await checkout_values(payload, customer, db, lock=True)
    if payload.expectedTotalAmount is not None and payload.expectedTotalAmount != summary["totalAmount"]:
        raise HTTPException(409, "Order total changed. Refresh your quote before starting payment.")
    success_url = valid_storefront_url(payload.successUrl)
    cancel_url = valid_storefront_url(payload.cancelUrl)
    target_currency = payload.currency.upper()
    converted_shipping = summary["shippingAmount"]
    currency = target_currency.lower()
    total = summary["totalAmount"]
    order_id = uuid4()
    order_number = f"PNY-{datetime.now(timezone.utc):%y%m%d}-{order_id.hex[:20].upper()}"
    address = payload.shippingAddress.model_dump()
    order = Order(
        id=order_id,
        order_number=order_number,
        customer_id=customer.id,
        customer_email=customer.email,
        status="pending_payment",
        payment_status="unpaid",
        fulfillment_status="unfulfilled",
        total_amount=total,
        subtotal_amount=summary["subtotalAmount"],
        discount_amount=summary["discountAmount"],
        shipping_amount=converted_shipping,
        tax_amount=summary["taxAmount"],
        tax_rate_bps=summary["taxRateBps"],
        coupon_code=summary["couponCode"],
        currency=currency.upper(),
        shipping_address=address,
        shipping_method=payload.shippingMethod,
        payment_method=payload.paymentMethod,
        payment_provider="stripe",
        capture_method=settings.stripe_capture_method,
    )
    discounts = allocate_discount(
        [converted_prices[item.variantId] * item.quantity for item in payload.items], summary["discountAmount"],
    )
    provider_expires_at = int((datetime.now(timezone.utc) + timedelta(minutes=30)).timestamp())
    for requested, line_discount in zip(payload.items, discounts, strict=True):
        variant = variant_by_id[requested.variantId]
        try:
            claimed = await db.execute(update(ProductVariant).where(
                ProductVariant.id == variant.id, ProductVariant.active.is_(True),
                ProductVariant.stock_quantity >= requested.quantity,
                ProductVariant.price_amount == variant.price_amount,
            ).values(stock_quantity=ProductVariant.stock_quantity - requested.quantity)
                .execution_options(synchronize_session=False))
        except OperationalError as error:
            await db.rollback()
            # SQLite snapshots cannot always upgrade to a writer; PostgreSQL
            # serialization/deadlock failures also require a whole-request retry.
            code = getattr(error.orig, "sqlstate", None) or getattr(error.orig, "pgcode", None)
            sqlite_code = getattr(error.orig, "sqlite_errorcode", 0)
            if code in {"40001", "40P01"} or (sqlite_code & 255) in {5, 6}:
                raise HTTPException(409, detail={
                    "code": "stock_reservation_conflict", "message": "Another checkout updated stock. Review your cart and try again.",
                }) from None
            raise
        if claimed.rowcount != 1:
            await db.rollback()
            raise HTTPException(409, "Stock or price changed. Review your cart before checkout.")
        offer_id = await reserve_supplier_stock(db, variant, requested.quantity)
        order.items.append(OrderItem(
            variant_id=variant.id,
            supplier_offer_id=offer_id,
            product_name=variant.product.name,
            supplier_name=variant.product.supplier_name,
            image_url=storefront_image_url(variant.product.image_url),
            image_alt=variant.product.image_alt,
            quantity=requested.quantity,
            unit_price=converted_prices[variant.id],
            currency=currency.upper(),
            discount_amount=line_discount,
            product_snapshot={"productId": str(variant.product.id), "slug": variant.product.slug,
                              "productSku": variant.product.sku, "variantSku": variant.sku,
                              "variantTitle": variant.title, "options": dict(variant.options or {}),
                              "sourceUnitPrice": variant.price_amount, "sourceCurrency": variant.currency,
                              "category": variant.product.category_name},
        ))
    order.checkout_idempotency_key = str(payload.idempotencyKey)
    order.checkout_request_hash = fingerprint
    order.checkout_request = {
        "successUrl": payload.successUrl, "cancelUrl": payload.cancelUrl,
    }
    order.reservation_expires_at = datetime.fromtimestamp(provider_expires_at, timezone.utc)
    db.add(order)
    db.add(OrderStatusHistory(
        order_id=order.id, to_status="pending_payment", payment_status="unpaid",
        fulfillment_status="unfulfilled", source="checkout", event_key="checkout.created",
    ))
    await record_transaction(db, order, kind="initiation", status="pending", amount=order.total_amount,
                             reference=None, key=f"initiation:{order.id}")
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(
            select(Order).where(Order.customer_id == customer.id,
                                Order.checkout_idempotency_key == str(payload.idempotencyKey))
            .options(selectinload(Order.items)).with_for_update()
        )
        if not existing:
            raise HTTPException(status_code=409, detail={
                "code": "checkout_idempotency_conflict", "message": "This checkout request could not be claimed. Retry with a new key.",
            }) from None
        if existing.checkout_request_hash != fingerprint:
            raise HTTPException(status_code=409, detail={
                "code": "checkout_idempotency_conflict", "message": "This checkout key was already used with different details.",
            }) from None
        order = existing
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=503, detail="Checkout could not be saved securely. Please retry with the same checkout key.") from None
    return await replay_or_resume_checkout(db, order)


