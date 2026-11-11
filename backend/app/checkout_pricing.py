"""Server-authoritative, integer-minor-unit checkout calculations."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.currency import convert_minor_amount
from app.models import Coupon, Order


def rounded_ratio(amount: int, numerator: int, denominator: int = 10000) -> int:
    """Round non-negative monetary ratios half-up, never with binary floats."""
    return (amount * numerator + denominator // 2) // denominator


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def coupon_discount(
    db: AsyncSession, code: str | None, subtotal: int, currency: str, rates: dict,
    customer_id, *, lock: bool,
) -> tuple[str | None, int]:
    if not code or not code.strip():
        return None, 0
    code = code.strip().upper()
    query = select(Coupon).where(Coupon.code == code)
    if lock:
        query = query.with_for_update()
    coupon = await db.scalar(query)
    now = datetime.now(timezone.utc)
    if (not coupon or not coupon.active or coupon.amount <= 0
            or coupon.minimum_subtotal < 0
            or (coupon.maximum_discount is not None and coupon.maximum_discount < 0)
            or (coupon.starts_at and utc(coupon.starts_at) > now)
            or (coupon.expires_at and utc(coupon.expires_at) <= now)):
        raise HTTPException(422, "This coupon is not valid or has expired.")
    # Pending orders reserve a redemption until provider-confirmed cancellation.
    used = select(func.count()).select_from(Order).where(
        Order.coupon_code == code, Order.status != "cancelled",
    )
    if coupon.max_redemptions is not None and (await db.scalar(used) or 0) >= coupon.max_redemptions:
        raise HTTPException(409, "This coupon has reached its redemption limit.")
    if coupon.per_customer_limit is not None:
        count = await db.scalar(used.where(Order.customer_id == customer_id)) or 0
        if count >= coupon.per_customer_limit:
            raise HTTPException(409, "You have already used this coupon.")
    minimum = convert_minor_amount(coupon.minimum_subtotal, coupon.currency, currency, rates)
    if subtotal < minimum:
        raise HTTPException(422, "Your order does not meet this coupon's minimum subtotal.")
    if coupon.discount_type == "percentage" and 0 < coupon.amount <= 10000:
        discount = rounded_ratio(subtotal, coupon.amount)
    elif coupon.discount_type == "fixed":
        discount = convert_minor_amount(coupon.amount, coupon.currency, currency, rates)
    else:
        raise HTTPException(422, "This coupon is not configured correctly.")
    if coupon.maximum_discount is not None:
        discount = min(discount, convert_minor_amount(coupon.maximum_discount, coupon.currency, currency, rates))
    return code, min(subtotal, discount)


def totals(subtotal: int, discount: int, shipping: int, country: str, currency: str, code: str | None) -> dict:
    rate = settings.checkout_tax_rates_bps.get(country, 0)
    tax_base = subtotal - discount + (shipping if settings.checkout_tax_shipping else 0)
    tax = rounded_ratio(tax_base, rate)
    return {
        "subtotalAmount": subtotal, "discountAmount": discount,
        "shippingAmount": shipping, "taxAmount": tax, "taxRateBps": rate,
        "totalAmount": subtotal - discount + shipping + tax,
        "currency": currency, "couponCode": code,
    }


def allocate_discount(amounts: list[int], discount: int) -> list[int]:
    """Largest-remainder allocation keeps line totals and Stripe totals identical."""
    subtotal = sum(amounts)
    if not discount or not subtotal:
        return [0] * len(amounts)
    allocations = [amount * discount // subtotal for amount in amounts]
    remainder = discount - sum(allocations)
    indices = sorted(range(len(amounts)), key=lambda index: (amounts[index] * discount) % subtotal, reverse=True)
    for index in indices[:remainder]:
        allocations[index] += 1
    return allocations
