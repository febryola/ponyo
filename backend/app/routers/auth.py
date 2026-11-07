import hmac
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import Customer
from app.rate_limit import enforce_rate_limit
from app.schemas import AcceptedOut, AuthCredentials, CustomerEnvelope, CustomerOut, PasswordResetRequest, RegisterRequest
from app.security import clear_session_cookie, get_current_customer, hash_password, set_session_cookie, verify_password

router = APIRouter(prefix="/auth", tags=["authentication"])


def check_csrf(request: Request) -> None:
    cookie_token = request.cookies.get(settings.csrf_cookie_name, "")
    header_token = request.headers.get("X-CSRF-Token", "")
    if not cookie_token or not header_token or not hmac.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")


def customer_envelope(customer: Customer) -> CustomerEnvelope:
    return CustomerEnvelope(customer=CustomerOut(id=customer.id, firstName=customer.first_name, lastName=customer.last_name, email=customer.email))


@router.get("/csrf")
async def issue_csrf_token(response: Response) -> dict[str, dict[str, str]]:
    token = secrets.token_urlsafe(32)
    response.set_cookie(
        settings.csrf_cookie_name,
        token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    return {"data": {"csrfToken": token}}


@router.post("/register", response_model=dict)
async def register(payload: RegisterRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    await enforce_rate_limit(request, "register", 5, 3600)
    normalized_email = payload.email.lower().strip()
    exists = await db.scalar(select(Customer.id).where(func.lower(Customer.email) == normalized_email))
    if exists:
        raise HTTPException(status_code=409, detail="An account already exists for this email.")
    customer = Customer(
        email=normalized_email,
        first_name=payload.firstName.strip(),
        last_name=payload.lastName.strip(),
        password_hash=hash_password(payload.password),
        marketing_opt_in=payload.marketingOptIn,
    )
    db.add(customer)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An account already exists for this email.") from None
    await db.refresh(customer)
    set_session_cookie(response, customer.id)
    return {"data": customer_envelope(customer).model_dump(mode="json")}


@router.post("/login", response_model=dict)
async def login(payload: AuthCredentials, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    await enforce_rate_limit(request, "login", 10, 60)
    customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == payload.email.lower().strip()))
    if not customer or not verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    set_session_cookie(response, customer.id)
    return {"data": customer_envelope(customer).model_dump(mode="json")}


@router.post("/logout", response_model=dict)
async def logout(request: Request):
    check_csrf(request)
    response = Response(content='{"data":{"accepted":true}}', media_type="application/json")
    clear_session_cookie(response)
    return response


@router.post("/password-reset", response_model=dict)
async def password_reset(_payload: PasswordResetRequest, request: Request):
    check_csrf(request)
    await enforce_rate_limit(request, "password-reset", 5, 3600)
    # TODO: publish a password-reset notification through SES/SQS after the email provider is configured.
    # Do not reveal whether the account exists.
    return {"data": AcceptedOut().model_dump()}


@router.get("/me", response_model=dict)
async def get_me(customer: Customer = Depends(get_current_customer)):
    return {"data": customer_envelope(customer).model_dump(mode="json")}


@router.get("/health")
async def auth_health() -> dict[str, str]:
    return {"status": "ok"}
