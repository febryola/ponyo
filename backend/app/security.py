from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import Customer

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def create_session_token(customer_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(customer_id),
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": now + timedelta(seconds=settings.session_ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def set_session_cookie(response, customer_id: UUID) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        create_session_token(customer_id),
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(settings.session_cookie_name, domain=settings.cookie_domain, path="/")


async def get_current_customer(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Customer:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required.")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer)
        customer_id = UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please sign in again.") from None
    customer = await db.scalar(select(Customer).where(Customer.id == customer_id))
    if not customer:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found.")
    if not customer.email_verified:
        raise HTTPException(status_code=403, detail={"code": "email_verification_required", "message": "Please verify your email before using your account."})
    return customer


async def get_optional_customer(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Customer | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer)
        customer_id = UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None
    customer = await db.scalar(select(Customer).where(Customer.id == customer_id))
    if customer and not customer.email_verified:
        raise HTTPException(status_code=403, detail={"code": "email_verification_required", "message": "Please verify your email before using your account."})
    return customer


def require_csrf(request: Request) -> None:
    cookie_token = request.cookies.get(settings.csrf_cookie_name, "")
    header_token = request.headers.get("X-CSRF-Token", "")
    if not cookie_token or not header_token or not __import__("hmac").compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")
