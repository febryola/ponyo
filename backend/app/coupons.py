"""Trusted operator coupon provisioning; never expose this as a customer API."""

import argparse
import asyncio
from datetime import datetime

from sqlalchemy import select

from app.currency import SUPPORTED_CURRENCIES
from app.db import SessionLocal
from app.models import Coupon


def parse_date(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("Use an ISO timestamp with a timezone.")
    return parsed


async def main() -> None:
    parser = argparse.ArgumentParser(description="Create a merchant coupon using trusted database credentials.")
    parser.add_argument("code")
    parser.add_argument("discount_type", choices=["percentage", "fixed"])
    parser.add_argument("amount", type=int, help="Basis points for percentage; minor units for fixed discounts.")
    parser.add_argument("--currency", choices=sorted(SUPPORTED_CURRENCIES), default="JPY")
    parser.add_argument("--minimum-subtotal", type=int, default=0)
    parser.add_argument("--maximum-discount", type=int)
    parser.add_argument("--max-redemptions", type=int)
    parser.add_argument("--per-customer-limit", type=int)
    parser.add_argument("--starts-at", type=parse_date)
    parser.add_argument("--expires-at", type=parse_date)
    args = parser.parse_args()
    code = args.code.strip().upper()
    if not code or len(code) > 64:
        parser.error("Code must contain 1–64 characters.")
    if args.amount <= 0 or (args.discount_type == "percentage" and args.amount > 10000):
        parser.error("Amount must be positive; percentage must not exceed 10000 basis points.")
    if any(value is not None and value < 0 for value in (
        args.minimum_subtotal, args.maximum_discount, args.max_redemptions, args.per_customer_limit,
    )):
        parser.error("Coupon limits cannot be negative.")
    if args.starts_at and args.expires_at and args.expires_at <= args.starts_at:
        parser.error("Expiry must be later than the start date.")
    async with SessionLocal() as db:
        if await db.scalar(select(Coupon.id).where(Coupon.code == code)):
            parser.error("Coupon already exists; existing promotions are not silently overwritten.")
        db.add(Coupon(code=code, discount_type=args.discount_type, amount=args.amount, currency=args.currency,
                      minimum_subtotal=args.minimum_subtotal, maximum_discount=args.maximum_discount,
                      max_redemptions=args.max_redemptions, per_customer_limit=args.per_customer_limit,
                      starts_at=args.starts_at, expires_at=args.expires_at))
        await db.commit()
    print(f"Created coupon {code}")


if __name__ == "__main__":
    asyncio.run(main())
