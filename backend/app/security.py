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


def create_session_token(customer_id: UUID, auth_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(customer_id),
        "iss": settings.jwt_issuer,
        "iat": now,
        "ver": auth_version,
        "exp": now + timedelta(seconds=settings.session_ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def set_session_cookie(response, customer_id: UUID, auth_version: int = 0) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        create_session_token(customer_id, auth_version),
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(settings.session_cookie_name, domain=settings.cookie_domain, path="/")


def session_identity(token: str) -> tuple[UUID, int]:
    payload = jwt.decode(
        token, settings.jwt_secret, algorithms=["HS256"], issuer=settings.jwt_issuer,
        options={"require": ["sub", "iss", "iat", "exp"]},
    )
    # Pre-migration cookies have version zero; once revoked they cannot be reused.
    version = payload.get("ver", 0)
    if not isinstance(payload["sub"], str) or type(version) is not int or version < 0:
        raise ValueError("Invalid session identity")
    return UUID(payload["sub"]), version


async def get_authenticated_customer(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Customer:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required.")
    try:
        customer_id, version = session_identity(token)
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please sign in again.") from None
    customer = await db.scalar(select(Customer).where(Customer.id == customer_id))
    if not customer:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found.")
    if customer.auth_version != version:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    if not customer.email_verified:
        raise HTTPException(status_code=403, detail={"code": "email_verification_required", "message": "Please verify your email before using your account."})
    return customer


def require_roles(*roles: str):
    allowed = frozenset(roles)
    if not allowed <= {"customer", "supplier", "admin"}:
        raise ValueError("Unknown account role in access policy.")

    async def role_guard(customer: Customer = Depends(get_authenticated_customer)) -> Customer:
        # Read the current database role, never a request body or JWT role claim.
        if customer.role not in allowed:
            raise HTTPException(status_code=403, detail={
                "code": "insufficient_role", "message": "Your account cannot access this resource.",
            })
        return customer

    return role_guard


async def get_current_customer(customer: Customer = Depends(require_roles("customer"))) -> Customer:
    """Storefront resources belong to customer accounts, not every signed-in role."""
    return customer


async def get_optional_customer(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Customer | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    try:
        customer_id, version = session_identity(token)
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError, AttributeError):
        return None
    customer = await db.scalar(select(Customer).where(Customer.id == customer_id))
    if customer is None or customer.auth_version != version:
        return None
    if customer and not customer.email_verified:
        raise HTTPException(status_code=403, detail={"code": "email_verification_required", "message": "Please verify your email before using your account."})
    if customer.role != "customer":
        raise HTTPException(status_code=403, detail={"code": "insufficient_role", "message": "Your account cannot access this resource."})
    return customer


def require_csrf(request: Request) -> None:
    cookie_token = request.cookies.get(settings.csrf_cookie_name, "")
    header_token = request.headers.get("X-CSRF-Token", "")
    if not cookie_token or not header_token or not __import__("hmac").compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")
