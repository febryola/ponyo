import hmac
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.email_notifications import send_password_reset_email
from app.models import Customer, CustomerAddress, PasswordResetToken, Product, WishlistItem
from app.rate_limit import enforce_rate_limit
from app.schemas import AcceptedOut, AuthCredentials, CustomerAddressInput, CustomerAddressOut, CustomerEnvelope, CustomerOut, CustomerProfileOut, CustomerProfileUpdate, PasswordResetConfirm, PasswordResetRequest, RegisterRequest, WishlistUpdate
from app.security import clear_session_cookie, get_current_customer, hash_password, require_csrf, set_session_cookie, verify_password

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
    normalized_email = str(payload.email).lower().strip()
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
    response.set_cookie(
        settings.csrf_cookie_name,
        secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    return {"data": customer_envelope(customer).model_dump(mode="json")}


@router.post("/login", response_model=dict)
async def login(payload: AuthCredentials, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    await enforce_rate_limit(request, "login", 10, 60)
    customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == str(payload.email).lower().strip()))
    if not customer or not verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    set_session_cookie(response, customer.id)
    response.set_cookie(
        settings.csrf_cookie_name,
        secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    return {"data": customer_envelope(customer).model_dump(mode="json")}


@router.post("/logout", response_model=dict)
async def logout(request: Request, response: Response):
    check_csrf(request)
    clear_session_cookie(response)
    response.delete_cookie(settings.csrf_cookie_name, domain=settings.cookie_domain, path="/")
    return {"data": {"accepted": True}}


@router.post("/password-reset", response_model=dict)
async def password_reset(_payload: PasswordResetRequest, request: Request, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    await enforce_rate_limit(request, "password-reset", 5, 3600)
    email = str(_payload.email).lower().strip()
    customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == email))
    if customer:
        token = secrets.token_urlsafe(32)
        token_record = PasswordResetToken(
            customer_id=customer.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(token_record)
        await db.commit()
        storefront = settings.frontend_origins.split(",")[0].strip().rstrip("/")
        reset_url = f"{storefront}/account/reset-password?token={quote(token)}"
        await send_password_reset_email(email, reset_url)
    return {"data": AcceptedOut().model_dump()}


@router.post("/password-reset/confirm", response_model=dict)
async def confirm_password_reset(payload: PasswordResetConfirm, request: Request, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    await enforce_rate_limit(request, "password-reset-confirm", 10, 3600)
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    token_record = await db.scalar(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.now(timezone.utc),
        )
    )
    if not token_record:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired.")
    customer = await db.get(Customer, token_record.customer_id)
    if not customer:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired.")
    customer.password_hash = hash_password(payload.password)
    token_record.used_at = datetime.now(timezone.utc)
    other_tokens = await db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.customer_id == customer.id,
            PasswordResetToken.id != token_record.id,
            PasswordResetToken.used_at.is_(None),
        )
    )
    for other_token in other_tokens:
        other_token.used_at = token_record.used_at
    await db.commit()
    return {"data": AcceptedOut().model_dump()}


@router.get("/me", response_model=dict)
async def get_me(customer: Customer = Depends(get_current_customer)):
    return {"data": CustomerProfileOut(id=customer.id, firstName=customer.first_name, lastName=customer.last_name, email=customer.email).model_dump(mode="json")}


@router.patch("/me", response_model=dict)
async def update_me(payload: CustomerProfileUpdate, request: Request, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    customer.first_name = payload.firstName.strip()
    customer.last_name = payload.lastName.strip()
    await db.commit()
    await db.refresh(customer)
    return {"data": CustomerProfileOut(id=customer.id, firstName=customer.first_name, lastName=customer.last_name, email=customer.email).model_dump(mode="json")}


def address_out(address: CustomerAddress) -> dict:
    return CustomerAddressOut(
        id=address.id, firstName=address.first_name, lastName=address.last_name,
        address1=address.address1, address2=address.address2, city=address.city,
        region=address.region, postalCode=address.postal_code, countryCode=address.country_code,
        phone=address.phone, isDefault=address.is_default,
    ).model_dump(mode="json")


async def clear_default_addresses(db: AsyncSession, customer_id, except_id=None) -> None:
    addresses = await db.scalars(select(CustomerAddress).where(CustomerAddress.customer_id == customer_id))
    for address in addresses:
        if address.id != except_id:
            address.is_default = False


@router.get("/addresses", response_model=dict)
async def list_addresses(customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    addresses = await db.scalars(
        select(CustomerAddress).where(CustomerAddress.customer_id == customer.id)
        .order_by(CustomerAddress.is_default.desc(), CustomerAddress.created_at.desc())
    )
    return {"data": [address_out(address) for address in addresses]}


@router.post("/addresses", response_model=dict)
async def create_address(payload: CustomerAddressInput, request: Request, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    current_addresses = await db.scalars(select(CustomerAddress).where(CustomerAddress.customer_id == customer.id))
    make_default = payload.isDefault or not list(current_addresses)
    if make_default:
        await clear_default_addresses(db, customer.id)
    values = payload.model_dump()
    values["countryCode"] = values["countryCode"].upper()
    address = CustomerAddress(
        customer_id=customer.id, first_name=values["firstName"].strip(), last_name=values["lastName"].strip(),
        address1=values["address1"].strip(), address2=values["address2"].strip(), city=values["city"].strip(),
        region=values["region"].strip(), postal_code=values["postalCode"].strip(), country_code=values["countryCode"],
        phone=values["phone"].strip(), is_default=make_default,
    )
    db.add(address)
    await db.commit()
    await db.refresh(address)
    return {"data": address_out(address)}


@router.patch("/addresses/{address_id}", response_model=dict)
async def update_address(address_id: UUID, payload: CustomerAddressInput, request: Request, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    address = await db.scalar(select(CustomerAddress).where(CustomerAddress.id == address_id, CustomerAddress.customer_id == customer.id))
    if not address:
        raise HTTPException(status_code=404, detail="Address not found.")
    values = payload.model_dump()
    if payload.isDefault:
        await clear_default_addresses(db, customer.id, except_id=address.id)
    address.first_name = values["firstName"].strip()
    address.last_name = values["lastName"].strip()
    address.address1 = values["address1"].strip()
    address.address2 = values["address2"].strip()
    address.city = values["city"].strip()
    address.region = values["region"].strip()
    address.postal_code = values["postalCode"].strip()
    address.country_code = values["countryCode"].upper()
    address.phone = values["phone"].strip()
    address.is_default = payload.isDefault or address.is_default
    await db.commit()
    await db.refresh(address)
    return {"data": address_out(address)}


@router.delete("/addresses/{address_id}", response_model=dict)
async def delete_address(address_id: UUID, request: Request, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    address = await db.scalar(select(CustomerAddress).where(CustomerAddress.id == address_id, CustomerAddress.customer_id == customer.id))
    if not address:
        raise HTTPException(status_code=404, detail="Address not found.")
    was_default = address.is_default
    await db.delete(address)
    await db.flush()
    if was_default:
        replacement = await db.scalar(
            select(CustomerAddress).where(CustomerAddress.customer_id == customer.id)
            .order_by(CustomerAddress.created_at.asc()).limit(1)
        )
        if replacement:
            replacement.is_default = True
    await db.commit()
    return {"data": {"accepted": True}}


@router.get("/wishlist", response_model=dict)
async def get_wishlist(customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    slugs = await db.scalars(
        select(Product.slug).join(WishlistItem, WishlistItem.product_id == Product.id)
        .where(WishlistItem.customer_id == customer.id)
        .order_by(WishlistItem.created_at.desc())
    )
    return {"data": {"productSlugs": list(slugs)}}


@router.put("/wishlist", response_model=dict)
async def update_wishlist(payload: WishlistUpdate, request: Request, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    unique_slugs = list(dict.fromkeys(slug.strip() for slug in payload.productSlugs if slug.strip()))
    if unique_slugs:
        products = await db.scalars(select(Product).where(Product.slug.in_(unique_slugs), Product.published.is_(True)))
        products_by_slug = {product.slug: product for product in products}
        if len(products_by_slug) != len(unique_slugs):
            raise HTTPException(status_code=422, detail="One or more saved plushies are no longer available.")
    else:
        products_by_slug = {}
    current_items = await db.scalars(select(WishlistItem).where(WishlistItem.customer_id == customer.id))
    for item in current_items:
        await db.delete(item)
    for slug in unique_slugs:
        db.add(WishlistItem(customer_id=customer.id, product_id=products_by_slug[slug].id))
    await db.commit()
    return {"data": {"productSlugs": unique_slugs}}


@router.get("/health")
async def auth_health() -> dict[str, str]:
    return {"status": "ok"}
