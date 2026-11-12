import hmac
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.email_notifications import send_password_reset_email, send_verification_email
from app.models import Customer, CustomerAddress, EmailVerificationToken, PasswordResetToken, Product, WishlistItem
from app.rate_limit import enforce_rate_limit
from app.schemas import AcceptedOut, AuthCredentials, CustomerAddressInput, CustomerAddressOut, CustomerEnvelope, CustomerOut, CustomerProfileOut, CustomerProfileUpdate, EmailVerificationConfirm, PasswordResetConfirm, PasswordResetRequest, RegisterRequest, WishlistUpdate
from app.security import clear_session_cookie, get_current_customer, hash_password, require_csrf, session_identity, set_session_cookie, verify_password
import jwt

router = APIRouter(prefix="/auth", tags=["authentication"])


def check_csrf(request: Request) -> None:
    cookie_token = request.cookies.get(settings.csrf_cookie_name, "")
    header_token = request.headers.get("X-CSRF-Token", "")
    if not cookie_token or not header_token or not hmac.compare_digest(cookie_token, header_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")


def customer_envelope(customer: Customer) -> CustomerEnvelope:
    return CustomerEnvelope(customer=CustomerOut(id=customer.id, firstName=customer.first_name, lastName=customer.last_name, email=customer.email, role=customer.role))


async def deliver_verification_email(customer: Customer, db: AsyncSession) -> None:
    token = secrets.token_urlsafe(32)
    token_record = EmailVerificationToken(
        customer_id=customer.id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    db.add(token_record)
    await db.commit()
    verification_url = f"{settings.storefront_base_url.rstrip('/')}/account/verify-email?token={quote(token)}"
    sent = await send_verification_email(customer.email, verification_url)
    if not sent:
        # Keep the pending account and any older delivered links usable for recovery.
        token_record.used_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=503, detail={
            "code": "verification_email_delivery_failed",
            "message": "We couldn't send your verification email. Your account is still pending. Please resend the verification email in a moment.",
        })


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
    customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == normalized_email))
    if customer and customer.email_verified:
        raise HTTPException(status_code=409, detail="An account already exists for this email.")
    if customer is None:
        customer = Customer(
            email=normalized_email,
            first_name=payload.firstName.strip(),
            last_name=payload.lastName.strip(),
            password_hash=hash_password(payload.password),
            marketing_opt_in=payload.marketingOptIn,
            email_verified=False,
        )
        db.add(customer)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == normalized_email))
            if customer is None or customer.email_verified:
                raise HTTPException(status_code=409, detail="An account already exists for this email.") from None
        await db.refresh(customer)

    # A repeat signup must never overwrite the existing owner's password/profile.
    await deliver_verification_email(customer, db)

    response.set_cookie(
        settings.csrf_cookie_name,
        secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    return {"data": {"accepted": True, "emailVerificationRequired": True}}


@router.post("/login", response_model=dict)
async def login(payload: AuthCredentials, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    await enforce_rate_limit(request, "login", 10, 60)
    customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == str(payload.email).lower().strip()))
    if not customer:
        raise HTTPException(status_code=401, detail={
            "code": "customer_not_found",
            "message": "This email is not registered. Please create a Ponyo account.",
        })
    if not verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=401, detail={
            "code": "invalid_password",
            "message": "Incorrect password. Try again or reset your password.",
        })
    if not customer.email_verified:
        raise HTTPException(status_code=403, detail={"code": "email_verification_required", "message": "Please verify your email before signing in."})
    if customer.role != "customer":
        raise HTTPException(status_code=403, detail={"code": "insufficient_role", "message": "Please use the sign-in service for your account role."})
    set_session_cookie(response, customer.id, customer.auth_version)
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
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        try:
            customer_id, version = session_identity(token)
        except (jwt.InvalidTokenError, KeyError, ValueError, TypeError, AttributeError):
            pass
        else:
            await db.execute(update(Customer).where(
                Customer.id == customer_id, Customer.auth_version == version,
            ).values(auth_version=Customer.auth_version + 1))
            await db.commit()
    clear_session_cookie(response)
    response.delete_cookie(settings.csrf_cookie_name, domain=settings.cookie_domain, path="/")
    return {"data": {"accepted": True}}


@router.post("/verify-email/resend", response_model=dict)
async def resend_verification_email(_payload: PasswordResetRequest, request: Request, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    await enforce_rate_limit(request, "verify-email-resend", 5, 3600)
    email = str(_payload.email).lower().strip()
    customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == email))
    if customer and not customer.email_verified:
        await deliver_verification_email(customer, db)
    return {"data": AcceptedOut().model_dump()}


@router.post("/verify-email/confirm", response_model=dict)
async def confirm_email_verification(payload: EmailVerificationConfirm, request: Request, db: AsyncSession = Depends(get_db)):
    check_csrf(request)
    await enforce_rate_limit(request, "verify-email-confirm", 10, 3600)
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    token_record = await db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == token_hash,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.expires_at > datetime.now(timezone.utc),
        )
    )
    if not token_record:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")
    customer = await db.scalar(select(Customer).where(Customer.id == token_record.customer_id).with_for_update())
    if not customer:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")
    now = datetime.now(timezone.utc)
    claimed = await db.scalar(
        update(EmailVerificationToken)
        .where(
            EmailVerificationToken.id == token_record.id,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.expires_at > now,
        )
        .values(used_at=now)
        .returning(EmailVerificationToken.id)
        .execution_options(synchronize_session=False)
    )
    if claimed is None:
        raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")
    customer.email_verified = True
    token_record.used_at = now
    other_tokens = await db.scalars(
        select(EmailVerificationToken).where(
            EmailVerificationToken.customer_id == customer.id,
            EmailVerificationToken.id != token_record.id,
            EmailVerificationToken.used_at.is_(None),
        )
    )
    for other_token in other_tokens:
        other_token.used_at = token_record.used_at
    await db.commit()
    return {"data": AcceptedOut().model_dump()}


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
        storefront = settings.storefront_base_url.rstrip("/")
        reset_url = f"{storefront}/account/reset-password?token={quote(token)}"
        sent = await send_password_reset_email(email, reset_url)
        if not sent:
            # Keep the same response for known/unknown addresses; never leave an
            # undelivered token usable or invalidate older delivered links.
            token_record.used_at = datetime.now(timezone.utc)
            await db.commit()
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
    customer = await db.scalar(select(Customer).where(Customer.id == token_record.customer_id).with_for_update())
    if not customer:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired.")
    if verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=400, detail={
            "code": "password_unchanged",
            "message": "Choose a new password that is different from your current password.",
        })
    now = datetime.now(timezone.utc)
    claimed = await db.scalar(
        update(PasswordResetToken).where(
            PasswordResetToken.id == token_record.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        ).values(used_at=now).returning(PasswordResetToken.id)
        .execution_options(synchronize_session=False)
    )
    if claimed is None:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or has expired.")
    customer.password_hash = hash_password(payload.password)
    customer.auth_version += 1
    token_record.used_at = now
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
    return {"data": CustomerProfileOut(id=customer.id, firstName=customer.first_name, lastName=customer.last_name, email=customer.email, role=customer.role).model_dump(mode="json")}


@router.patch("/me", response_model=dict)
async def update_me(payload: CustomerProfileUpdate, request: Request, customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    customer.first_name = payload.firstName.strip()
    customer.last_name = payload.lastName.strip()
    await db.commit()
    await db.refresh(customer)
    return {"data": CustomerProfileOut(id=customer.id, firstName=customer.first_name, lastName=customer.last_name, email=customer.email, role=customer.role).model_dump(mode="json")}


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
