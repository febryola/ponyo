import hashlib
import smtplib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest
import stripe
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import ContactRequest as ContactRequestModel
from app.models import Customer, CustomerAddress, EmailVerificationToken, ProductReview, ProductWaitlistEntry, WishlistItem
from app.models import Order, OrderItem, OutboxEvent, ProcessedWebhook, Product, ProductTranslation, ProductVariant
from app.config import Settings, settings
from app.email_notifications import send_password_reset_email, send_verification_email
from app.security import create_session_token, hash_password, verify_password


@pytest.fixture(autouse=True)
def safe_auth_email_and_cookies(monkeypatch):
    async def email_sent(*_args):
        return True

    # Patch the router's imported senders; transport tests below use the real wrappers
    # with a mocked SMTP implementation, never a network connection.
    monkeypatch.setattr("app.routers.auth.send_verification_email", email_sent)
    monkeypatch.setattr("app.routers.auth.send_password_reset_email", email_sent)
    monkeypatch.setattr(settings, "cookie_secure", False)
    monkeypatch.setattr(settings, "cookie_domain", None)
    monkeypatch.setattr(settings, "cookie_samesite", "lax")


@pytest.fixture
def verification_mail(monkeypatch):
    deliveries = []

    async def capture(email, url):
        deliveries.append((email, url))
        return True

    monkeypatch.setattr("app.routers.auth.send_verification_email", capture)
    return deliveries


def registration_payload(**overrides):
    return {
        "firstName": "Test", "lastName": "Buyer", "email": "buyer@example.com",
        "password": "valid-password-123", "marketingOptIn": False, **overrides,
    }


async def auth_post(client, path, payload):
    return await client.post(
        f"/v1/auth/{path}", headers={"X-CSRF-Token": await csrf_token(client)}, json=payload,
    )


def verification_token(delivery):
    return parse_qs(urlparse(delivery[1]).query)["token"][0]


async def seed_customer_session(client, session_factory, *, verified=True, email="buyer@example.com"):
    async with session_factory() as db:
        customer = Customer(
            email=email, first_name="Test", last_name="Buyer",
            password_hash=hash_password("valid-password-123"), email_verified=verified,
        )
        db.add(customer)
        await db.commit()
        customer_id = customer.id
    client.cookies.set(settings.session_cookie_name, create_session_token(customer_id))
    return customer_id


def checkout_payload(variant_id, *, email="buyer@example.com"):
    return {
        "email": email,
        "shippingAddress": {
            "firstName": "Test", "lastName": "Buyer", "address1": "1 Test St",
            "region": "Tokyo", "city": "Tokyo", "postalCode": "1000001",
            "phone": "+81 90 0000 0000", "countryCode": "JP",
        },
        "shippingMethod": "standard", "paymentMethod": "card",
        "items": [{"variantId": str(variant_id), "quantity": 1}],
        "successUrl": "http://localhost:3000/orders?checkout=success",
        "cancelUrl": "http://localhost:3000/checkout?checkout=cancelled",
    }


async def add_product(session_factory, *, slug="test-bunny", price=1500, stock=4, price_history=None):
    async with session_factory() as db:
        product = Product(
            id=uuid4(), slug=slug, name=slug.title(), description="Soft toy", currency="JPY",
            price_amount=price, availability="available", category_name="Bunnies", supplier_name="Ponyo",
            image_url="https://example.test/bunny.png", image_alt="Bunny", tags=["bunny"], published=True,
            price_history=price_history or [],
        )
        db.add(product)
        await db.flush()
        variant = ProductVariant(product_id=product.id, title="Default", sku=f"PNV-{uuid4().hex[:12].upper()}", options={"Color": "Soft cream", "Size": "18 cm"}, currency="JPY", price_amount=price, stock_quantity=stock, active=True)
        db.add(variant)
        await db.commit()
        return product.id, variant.id


async def csrf_token(client):
    response = await client.get("/v1/auth/csrf")
    return response.json()["data"]["csrfToken"]


def test_local_dev_cookie_policy_allows_cross_origin_csrf_flows():
    local_settings = Settings(frontend_origins="http://localhost:3000,http://localhost:3003", environment="local")
    assert local_settings.cookie_samesite == "none"
    assert local_settings.cookie_secure is True


@pytest.mark.asyncio
async def test_local_dev_verification_email_without_smtp_reports_failure(monkeypatch):
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "smtp_host", None)
    result = await send_verification_email("local@example.com", "http://localhost:3000/account/verify-email?token=abc123")
    assert result is False


@pytest.fixture
async def test_client():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.state.environment = "test"
    app.state.redis = None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        yield client, session_factory
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_products_catalog_envelope(test_client):
    client, session_factory = test_client
    await add_product(session_factory)

    response = await client.get("/v1/products")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["data"][0]["slug"] == "test-bunny"
    assert payload["data"][0]["variantId"]
    assert payload["data"][0]["sku"].startswith("PNY-")
    assert payload["data"][0]["variants"][0]["sku"].startswith("PNV-")
    assert payload["data"][0]["variants"][0]["options"] == {"Color": "Soft cream", "Size": "18 cm"}
    detail = await client.get(f"/v1/products/{payload['data'][0]['id']}")
    assert detail.status_code == 200
    assert detail.json()["data"]["id"] == payload["data"][0]["id"]
    assert (await client.get("/v1/products/test-bunny")).json()["data"]["id"] == payload["data"][0]["id"]


@pytest.mark.asyncio
async def test_product_locale_falls_back_to_english_when_translation_is_disabled(test_client, monkeypatch):
    client, session_factory = test_client
    await add_product(session_factory)
    monkeypatch.setattr(settings, "translation_provider", "disabled")

    response = await client.get("/v1/products?locale=ja")

    assert response.status_code == 200
    assert response.json()["data"][0]["name"] == "Test-Bunny"
    async with session_factory() as db:
        assert await db.scalar(select(ProductTranslation.id)) is None


@pytest.mark.asyncio
async def test_product_translation_is_cached_and_invalidated_by_source_changes(test_client, monkeypatch):
    client, session_factory = test_client
    product_id, _ = await add_product(session_factory)
    calls = []

    def fake_translate(text, target_language):
        calls.append((text, target_language))
        return f"{target_language}:{text}"

    monkeypatch.setattr(settings, "translation_provider", "aws_translate")
    monkeypatch.setattr("app.translations._translate_with_aws", fake_translate)

    first = await client.get("/v1/products?locale=ja")
    second = await client.get(f"/v1/products/{product_id}?locale=ja")
    assert first.json()["data"][0]["name"] == "ja:Test-Bunny"
    assert second.json()["data"]["name"] == "ja:Test-Bunny"
    assert len(calls) == 2

    async with session_factory() as db:
        product = await db.get(Product, product_id)
        product.name = "Updated Bunny"
        await db.commit()

    updated = await client.get(f"/v1/products/{product_id}?locale=ja")
    assert updated.json()["data"]["name"] == "ja:Updated Bunny"
    assert len(calls) == 4
    async with session_factory() as db:
        cached = await db.scalar(select(ProductTranslation).where(ProductTranslation.product_id == product_id))
        assert cached is not None
        assert cached.name == "ja:Updated Bunny"


@pytest.mark.asyncio
async def test_product_price_history_is_returned_by_catalog_and_detail(test_client):
    client, session_factory = test_client
    history = [{"date": "2026-11-08", "price": 1800}, {"date": "2026-11-09", "price": 1500}]
    product_id, _ = await add_product(session_factory, price_history=history)

    catalog = await client.get("/v1/products")
    detail = await client.get(f"/v1/products/{product_id}")

    assert catalog.status_code == 200
    assert catalog.json()["data"][0]["priceHistory"] == history
    assert detail.status_code == 200
    assert detail.json()["data"]["priceHistory"] == history


@pytest.mark.asyncio
async def test_order_history_and_detail_return_shipping_and_tracking(test_client):
    client, session_factory = test_client
    csrf = await csrf_token(client)
    registration = await client.post(
        "/v1/auth/register",
        headers={"X-CSRF-Token": csrf},
        json={"firstName": "Test", "lastName": "Buyer", "email": "tracking@example.com", "password": "valid-password-123", "marketingOptIn": False},
    )
    assert registration.status_code == 200
    async with session_factory() as db:
        customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == "tracking@example.com"))
        customer_id = customer.id
        customer.email_verified = True
        await db.commit()
    csrf = client.cookies.get("ponyo_csrf")
    login = await client.post(
        "/v1/auth/login",
        headers={"X-CSRF-Token": csrf},
        json={"email": "tracking@example.com", "password": "valid-password-123"},
    )
    assert login.status_code == 200
    order_id = uuid4()
    async with session_factory() as db:
        order = Order(
            id=order_id, order_number="PNY-TRACK-TEST", customer_id=customer_id,
            customer_email="tracking@example.com", status="processing", payment_status="paid",
            fulfillment_status="shipped", total_amount=1500, currency="JPY",
            shipping_address={"firstName": "Test", "lastName": "Buyer", "address1": "1 Test St", "address2": "Room 2", "region": "Tokyo", "city": "Tokyo", "postalCode": "1000001", "countryCode": "JP"},
            shipping_method="standard", payment_method="card", payment_provider="stripe",
            tracking_number="JP1234567890", tracking_carrier="Japan Post",
        )
        db.add(order)
        await db.commit()

    history = await client.get("/v1/orders")
    detail = await client.get(f"/v1/orders/{order_id}")
    for response in (history, detail):
        assert response.status_code == 200
    payload = history.json()["data"][0]
    assert payload["trackingNumber"] == "JP1234567890"
    assert payload["trackingCarrier"] == "Japan Post"
    assert "Room 2" in payload["deliveryAddress"]
    assert detail.json()["data"]["orderNumber"] == "PNY-TRACK-TEST"


@pytest.mark.asyncio
async def test_catalog_price_filter_uses_product_variant(test_client):
    client, session_factory = test_client
    await add_product(session_factory, slug="affordable", price=1000)
    await add_product(session_factory, slug="premium", price=9000)

    response = await client.get("/v1/products?min_price=800&max_price=2000")
    assert response.status_code == 200
    assert [product["slug"] for product in response.json()["data"]] == ["affordable"]


@pytest.mark.asyncio
async def test_auth_mutation_requires_csrf(test_client):
    client, _ = test_client
    response = await client.post("/v1/auth/register", json={
        "firstName": "Test", "lastName": "Customer", "email": "test@example.com",
        "password": "valid-password-123", "marketingOptIn": False,
    })
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("password", ["passwordonly", "password123", "short!1"])
async def test_registration_rejects_password_without_required_strength(test_client, password):
    client, _ = test_client
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/auth/register",
        headers={"X-CSRF-Token": csrf},
        json={"firstName": "Test", "lastName": "Customer", "email": "weak@example.com", "password": password, "marketingOptIn": False},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_registration_accepts_password_with_number_and_special_character(test_client):
    client, _ = test_client
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/auth/register",
        headers={"X-CSRF-Token": csrf},
        json={"firstName": "Test", "lastName": "Customer", "email": "strong@example.com", "password": "password-123", "marketingOptIn": False},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_register_existing_email_returns_sign_in_conflict(test_client):
    client, session_factory = test_client
    csrf = await csrf_token(client)
    payload = {"firstName": "Test", "lastName": "Buyer", "email": "already@example.com", "password": "valid-password-123", "marketingOptIn": False}
    first = await client.post("/v1/auth/register", headers={"X-CSRF-Token": csrf}, json=payload)
    assert first.status_code == 200
    async with session_factory() as db:
        customer = await db.scalar(select(Customer).where(Customer.email == payload["email"]))
        customer.email_verified = True
        await db.commit()
    csrf = await csrf_token(client)
    second = await client.post("/v1/auth/register", headers={"X-CSRF-Token": csrf}, json=payload)
    assert first.status_code == 200
    assert second.status_code == 409
    assert "already exists" in second.json()["error"]["message"]


@pytest.mark.asyncio
async def test_register_creates_unverified_account_and_requires_email_verification(test_client, monkeypatch):
    client, session_factory = test_client
    csrf = await csrf_token(client)
    verification_links = []

    async def capture_verification_email(email, url):
        verification_links.append((email, url))
        return True

    monkeypatch.setattr("app.routers.auth.send_verification_email", capture_verification_email)

    response = await client.post(
        "/v1/auth/register",
        headers={"X-CSRF-Token": csrf},
        json={"firstName": "Test", "lastName": "Customer", "email": "verify@example.com", "password": "valid-password-123", "marketingOptIn": False},
    )
    assert response.status_code == 200
    assert response.json() == {"data": {"accepted": True, "emailVerificationRequired": True}}
    assert client.cookies.get("ponyo_session") is None
    async with session_factory() as db:
        customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == "verify@example.com"))
        assert customer is not None
        assert customer.email_verified is False

    csrf = client.cookies.get("ponyo_csrf")
    login = await client.post(
        "/v1/auth/login",
        headers={"X-CSRF-Token": csrf},
        json={"email": "verify@example.com", "password": "valid-password-123"},
    )
    assert login.status_code == 403
    assert login.json()["error"]["code"] == "email_verification_required"
    assert login.json()["error"]["message"] == "Please verify your email before signing in."
    assert verification_links
    token = verification_links[0][1].split("token=", 1)[1]

    verify = await client.post(
        "/v1/auth/verify-email/confirm",
        headers={"X-CSRF-Token": csrf},
        json={"token": token},
    )
    assert verify.status_code == 200

    login_after_verify = await client.post(
        "/v1/auth/login",
        headers={"X-CSRF-Token": csrf},
        json={"email": "verify@example.com", "password": "valid-password-123"},
    )
    assert login_after_verify.status_code == 200
    assert client.cookies.get("ponyo_session") is not None


@pytest.mark.asyncio
async def test_profile_and_customer_addresses_are_persisted_and_private(test_client):
    client, session_factory = test_client
    csrf = await csrf_token(client)
    registration = await client.post(
        "/v1/auth/register",
        headers={"X-CSRF-Token": csrf},
        json={"firstName": "Mika", "lastName": "Plush", "email": "mika@example.com", "password": "valid-password-123", "marketingOptIn": False},
    )
    assert registration.status_code == 200
    async with session_factory() as db:
        customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == "mika@example.com"))
        customer.email_verified = True
        await db.commit()

    csrf = client.cookies.get("ponyo_csrf")
    login = await client.post(
        "/v1/auth/login",
        headers={"X-CSRF-Token": csrf},
        json={"email": "mika@example.com", "password": "valid-password-123"},
    )
    assert login.status_code == 200
    csrf = client.cookies.get("ponyo_csrf")
    profile = await client.patch(
        "/v1/auth/me", headers={"X-CSRF-Token": csrf}, json={"firstName": "Mikaela", "lastName": "Cloud"},
    )
    assert profile.status_code == 200
    assert profile.json()["data"]["firstName"] == "Mikaela"

    address_body = {
        "firstName": "Mikaela", "lastName": "Cloud", "address1": "1 Sea Lane", "address2": "Unit 3",
        "city": "Tokyo", "region": "Tokyo", "postalCode": "1000001", "countryCode": "jp", "phone": "+81 90 0000 0000",
    }
    first = await client.post("/v1/auth/addresses", headers={"X-CSRF-Token": csrf}, json=address_body)
    assert first.status_code == 200
    first_address = first.json()["data"]
    assert first_address["isDefault"] is True
    assert first_address["countryCode"] == "JP"

    second = await client.post(
        "/v1/auth/addresses", headers={"X-CSRF-Token": csrf}, json={**address_body, "address1": "2 Cloud Street", "isDefault": True},
    )
    second_id = second.json()["data"]["id"]
    listed = await client.get("/v1/auth/addresses")
    assert [entry["isDefault"] for entry in listed.json()["data"]] == [True, False]

    deleted = await client.delete(f"/v1/auth/addresses/{second_id}", headers={"X-CSRF-Token": csrf})
    assert deleted.status_code == 200
    remaining = await client.get("/v1/auth/addresses")
    assert len(remaining.json()["data"]) == 1
    assert remaining.json()["data"][0]["isDefault"] is True

    async with session_factory() as db:
        stored = await db.scalar(select(CustomerAddress))
        assert stored and stored.address1 == "1 Sea Lane"


@pytest.mark.asyncio
async def test_account_endpoints_require_existing_authenticated_customer(test_client):
    client, _ = test_client
    assert (await client.get("/v1/auth/addresses")).status_code == 401
    csrf = await csrf_token(client)
    unknown_login = await client.post(
        "/v1/auth/login", headers={"X-CSRF-Token": csrf},
        json={"email": "not-registered@example.com", "password": "valid-password-123"},
    )
    assert unknown_login.status_code == 401
    assert unknown_login.json()["error"]["message"] == "Email or password is incorrect."


@pytest.mark.asyncio
async def test_password_reset_uses_single_use_database_token(test_client, monkeypatch):
    client, session_factory = test_client
    csrf = await csrf_token(client)
    registered = await client.post(
        "/v1/auth/register", headers={"X-CSRF-Token": csrf},
        json={"firstName": "Mika", "lastName": "Cloud", "email": "reset@example.com", "password": "valid-password-123", "marketingOptIn": False},
    )
    assert registered.status_code == 200
    async with session_factory() as db:
        customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == "reset@example.com"))
        customer.email_verified = True
        await db.commit()
    reset_links = []

    async def capture_reset_email(email, url):
        reset_links.append((email, url))
        return True

    monkeypatch.setattr("app.routers.auth.send_password_reset_email", capture_reset_email)
    csrf = client.cookies.get("ponyo_csrf")
    requested = await client.post(
        "/v1/auth/password-reset", headers={"X-CSRF-Token": csrf}, json={"email": "reset@example.com"},
    )
    assert requested.status_code == 200
    assert requested.json()["data"]["accepted"] is True
    assert reset_links and reset_links[0][0] == "reset@example.com"
    token = reset_links[0][1].split("token=", 1)[1]

    reset = await client.post(
        "/v1/auth/password-reset/confirm", headers={"X-CSRF-Token": csrf},
        json={"token": token, "password": "new-valid-password-456"},
    )
    assert reset.status_code == 200
    reused = await client.post(
        "/v1/auth/password-reset/confirm", headers={"X-CSRF-Token": csrf},
        json={"token": token, "password": "another-valid-password-789"},
    )
    assert reused.status_code == 400
    login = await client.post(
        "/v1/auth/login", headers={"X-CSRF-Token": csrf},
        json={"email": "reset@example.com", "password": "new-valid-password-456"},
    )
    assert login.status_code == 200

    weak_reset = await client.post(
        "/v1/auth/password-reset/confirm", headers={"X-CSRF-Token": csrf},
        json={"token": token, "password": "weakpassword1"},
    )
    assert weak_reset.status_code == 422


@pytest.mark.asyncio
async def test_customer_wishlist_persists_published_catalog_items(test_client):
    client, session_factory = test_client
    _, first_variant = await add_product(session_factory, slug="wishlist-bunny")
    await add_product(session_factory, slug="wishlist-kitty")
    csrf = await csrf_token(client)
    registered = await client.post(
        "/v1/auth/register", headers={"X-CSRF-Token": csrf},
        json={"firstName": "Mika", "lastName": "Cloud", "email": "wishlist@example.com", "password": "valid-password-123", "marketingOptIn": False},
    )
    assert registered.status_code == 200
    async with session_factory() as db:
        customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == "wishlist@example.com"))
        customer.email_verified = True
        await db.commit()
    csrf = client.cookies.get("ponyo_csrf")
    login = await client.post(
        "/v1/auth/login", headers={"X-CSRF-Token": csrf},
        json={"email": "wishlist@example.com", "password": "valid-password-123"},
    )
    assert login.status_code == 200
    csrf = client.cookies.get("ponyo_csrf")

    updated = await client.put(
        "/v1/auth/wishlist", headers={"X-CSRF-Token": csrf},
        json={"productSlugs": ["wishlist-bunny", "wishlist-kitty", "wishlist-bunny"]},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["productSlugs"] == ["wishlist-bunny", "wishlist-kitty"]
    listed = await client.get("/v1/auth/wishlist")
    assert set(listed.json()["data"]["productSlugs"]) == {"wishlist-bunny", "wishlist-kitty"}

    invalid = await client.put(
        "/v1/auth/wishlist", headers={"X-CSRF-Token": csrf}, json={"productSlugs": ["missing-plush"]},
    )
    assert invalid.status_code == 422
    async with session_factory() as db:
        items = list((await db.scalars(select(WishlistItem))).all())
        assert len(items) == 2
        assert all(item.product_id != first_variant for item in items)


@pytest.mark.asyncio
async def test_product_reviews_require_account_and_are_listed_with_summary(test_client):
    client, session_factory = test_client
    product_id, _ = await add_product(session_factory, slug="review-bunny")
    assert (await client.get(f"/v1/products/{product_id}/reviews")).json()["data"]["reviewCount"] == 0
    anonymous_csrf = await csrf_token(client)
    denied = await client.post(
        f"/v1/products/{product_id}/reviews", headers={"X-CSRF-Token": anonymous_csrf},
        json={"rating": 5, "title": "So soft", "body": "This plush is lovely and very soft."},
    )
    assert denied.status_code == 401

    registered = await client.post(
        "/v1/auth/register", headers={"X-CSRF-Token": anonymous_csrf},
        json={"firstName": "Mika", "lastName": "Cloud", "email": "reviewer@example.com", "password": "valid-password-123!", "marketingOptIn": False},
    )
    assert registered.status_code == 200
    async with session_factory() as db:
        customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == "reviewer@example.com"))
        customer.email_verified = True
        await db.commit()
    csrf = client.cookies.get("ponyo_csrf")
    login = await client.post(
        "/v1/auth/login", headers={"X-CSRF-Token": csrf},
        json={"email": "reviewer@example.com", "password": "valid-password-123!"},
    )
    assert login.status_code == 200
    csrf = client.cookies.get("ponyo_csrf")
    review_response = await client.post(
        f"/v1/products/{product_id}/reviews", headers={"X-CSRF-Token": csrf},
        json={"rating": 5, "title": "So soft", "body": "This plush is lovely and very soft."},
    )
    assert review_response.status_code == 200
    rating_only = await client.post(
        f"/v1/products/{product_id}/reviews", headers={"X-CSRF-Token": csrf},
        json={"rating": 5},
    )
    assert rating_only.status_code == 200
    duplicate = await client.post(
        f"/v1/products/{product_id}/reviews", headers={"X-CSRF-Token": csrf},
        json={"rating": 4, "title": "Updated review", "body": "This plush is lovely and very soft.", "photos": ["data:image/jpeg;base64,/9j/AA=="]},
    )
    assert duplicate.status_code == 200
    listed = await client.get(f"/v1/products/{product_id}/reviews")
    assert listed.json()["data"]["reviewCount"] == 1
    assert listed.json()["data"]["averageRating"] == 4
    assert listed.json()["data"]["reviews"][0]["reviewerName"] == "Mika"
    assert listed.json()["data"]["reviews"][0]["photos"] == ["data:image/jpeg;base64,/9j/AA=="]
    assert datetime.fromisoformat(listed.json()["data"]["reviews"][0]["createdAt"])
    async with session_factory() as db:
        saved_review = await db.scalar(select(ProductReview))
        assert saved_review is not None
        assert saved_review.created_at is not None


@pytest.mark.asyncio
async def test_product_waitlist_persists_and_deduplicates_email(test_client):
    client, session_factory = test_client
    product_id, _ = await add_product(session_factory, slug="waitlist-dino")
    csrf = await csrf_token(client)
    payload = {"email": "plush-friend@example.com", "firstName": "Plush"}
    first = await client.post(
        f"/v1/products/{product_id}/waitlist", headers={"X-CSRF-Token": csrf}, json=payload,
    )
    second = await client.post(
        f"/v1/products/{product_id}/waitlist", headers={"X-CSRF-Token": csrf}, json=payload,
    )
    assert first.status_code == second.status_code == 200
    async with session_factory() as db:
        entries = list((await db.scalars(select(ProductWaitlistEntry))).all())
        assert len(entries) == 1
        assert entries[0].email == "plush-friend@example.com"


@pytest.mark.asyncio
async def test_signed_in_product_waitlist_attaches_customer_account(test_client):
    client, session_factory = test_client
    product_id, _ = await add_product(session_factory, slug="coming-soon-cloud")
    csrf = await csrf_token(client)
    registration = await client.post(
        "/v1/auth/register", headers={"X-CSRF-Token": csrf},
        json={"firstName": "Nina", "lastName": "Sea", "email": "nina@example.com", "password": "valid-password-123!", "marketingOptIn": False},
    )
    assert registration.status_code == 200
    async with session_factory() as db:
        customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == "nina@example.com"))
        customer.email_verified = True
        await db.commit()
    csrf = client.cookies.get("ponyo_csrf")
    login = await client.post(
        "/v1/auth/login", headers={"X-CSRF-Token": csrf},
        json={"email": "nina@example.com", "password": "valid-password-123!"},
    )
    assert login.status_code == 200
    csrf = client.cookies.get("ponyo_csrf")
    response = await client.post(
        f"/v1/products/{product_id}/waitlist", headers={"X-CSRF-Token": csrf},
        json={"email": "nina@example.com", "firstName": "Nina"},
    )
    assert response.status_code == 200
    async with session_factory() as db:
        entry = await db.scalar(select(ProductWaitlistEntry).where(ProductWaitlistEntry.email == "nina@example.com"))
        assert entry and entry.customer_id is not None


@pytest.mark.asyncio
async def test_checkout_refuses_missing_stripe_config(test_client, monkeypatch):
    client, session_factory = test_client
    await seed_customer_session(client, session_factory)
    monkeypatch.setattr(settings, "stripe_secret_key", None)
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/checkout/sessions",
        headers={"X-CSRF-Token": csrf},
        json={
            "email": "buyer@example.com",
            "shippingAddress": {"firstName": "Test", "lastName": "Buyer", "address1": "1 Test St", "region": "Tokyo", "city": "Tokyo", "postalCode": "1000001", "phone": "+81 90 0000 0000", "countryCode": "JP"},
            "shippingMethod": "standard", "paymentMethod": "card", "items": [{"variantId": str(uuid4()), "quantity": 1}],
            "successUrl": "http://localhost:3000/orders?checkout=success", "cancelUrl": "http://localhost:3000/checkout?checkout=cancelled",
        },
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


@pytest.mark.asyncio
async def test_supplier_contact_request_is_saved_queued_and_notified(test_client, monkeypatch):
    client, session_factory = test_client
    async def email_sent(*_args):
        return True
    monkeypatch.setattr("app.routers.content.send_contact_notification", email_sent)
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/contact/requests",
        headers={"X-CSRF-Token": csrf},
        json={
            "name": "Mika Maker",
            "email": "maker@example.com",
            "requestType": "Supplier partnership",
            "message": "Company / maker: Little Cloud Studio\nProduct category: Plush toys\nWe make small-batch plush friends.",
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["accepted"] is True
    assert response.json()["data"]["emailNotificationSent"] is True
    assert response.json()["data"]["notificationEmail"] == settings.contact_notification_email
    async with session_factory() as db:
        inquiry = await db.scalar(select(ContactRequestModel))
        event = await db.scalar(select(OutboxEvent).where(OutboxEvent.event_type == "contact.request_received"))
        assert inquiry and inquiry.request_type == "Supplier partnership"
        assert event and "Little Cloud Studio" in event.payload["message"]


@pytest.mark.asyncio
async def test_contact_request_is_saved_when_email_is_not_configured(test_client, monkeypatch):
    client, session_factory = test_client
    async def email_not_configured(*_args):
        return False
    monkeypatch.setattr("app.routers.content.send_contact_notification", email_not_configured)
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/contact/requests",
        headers={"X-CSRF-Token": csrf},
        json={"name": "Plush Friend", "email": "friend@example.com", "requestType": "Plush request", "message": "Looking for a small grey bunny."},
    )
    assert response.status_code == 200
    assert response.json()["data"]["accepted"] is True
    assert response.json()["data"]["emailNotificationSent"] is False
    async with session_factory() as db:
        inquiry = await db.scalar(select(ContactRequestModel).where(ContactRequestModel.email == "friend@example.com"))
        assert inquiry and inquiry.message == "Looking for a small grey bunny."


@pytest.mark.asyncio
async def test_checkout_uses_database_price_and_reserves_stock(test_client, monkeypatch):
    client, session_factory = test_client
    customer_id = await seed_customer_session(client, session_factory)
    _, variant_id = await add_product(session_factory, price=1500, stock=4)
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "frontend_origins", "http://localhost:3000")
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_dummy")
    created_sessions = []

    def fake_create(**kwargs):
        created_sessions.append(kwargs)
        return SimpleNamespace(
            id="cs_test_ponyo",
            url="https://checkout.stripe.test/session",
            expires_at=int(datetime.now(timezone.utc).timestamp()) + 1800,
        )

    monkeypatch.setattr(stripe.checkout.Session, "create", fake_create)
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/checkout/sessions",
        headers={"X-CSRF-Token": csrf},
        json={
            "email": "buyer@example.com",
            "shippingAddress": {"firstName": "Test", "lastName": "Buyer", "address1": "1 Test St", "region": "Tokyo", "city": "Tokyo", "postalCode": "1000001", "phone": "+81 90 0000 0000", "countryCode": "JP"},
            "shippingMethod": "standard", "paymentMethod": "card", "items": [{"variantId": str(variant_id), "quantity": 2}],
            "successUrl": "http://localhost:3000/orders?checkout=success", "cancelUrl": "http://localhost:3000/checkout?checkout=cancelled",
        },
    )
    assert response.status_code == 200, response.json()
    assert created_sessions[0]["line_items"][0]["price_data"]["unit_amount"] == 1500
    assert response.json()["data"]["checkoutUrl"] == "https://checkout.stripe.test/session"
    async with session_factory() as db:
        variant = await db.get(ProductVariant, variant_id)
        assert variant.stock_quantity == 2
        order = await db.scalar(select(Order))
        assert order.customer_id == customer_id
        assert order.customer_email == "buyer@example.com"


@pytest.mark.asyncio
async def test_checkout_converts_selected_currency_for_stripe_and_order(test_client, monkeypatch):
    client, session_factory = test_client
    await seed_customer_session(client, session_factory)
    _, variant_id = await add_product(session_factory, price=1500, stock=4)
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "frontend_origins", "http://localhost:3000")
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_dummy")

    async def fake_rates():
        return {"base": "JPY", "rates": {"JPY": 1, "USD": 0.0067}}

    monkeypatch.setattr("app.routers.checkout.get_jpy_rates", fake_rates)
    created_sessions = []

    def fake_create(**kwargs):
        created_sessions.append(kwargs)
        return SimpleNamespace(
            id="cs_test_ponyo_usd",
            url="https://checkout.stripe.test/session",
            expires_at=int(datetime.now(timezone.utc).timestamp()) + 1800,
        )

    monkeypatch.setattr(stripe.checkout.Session, "create", fake_create)
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/checkout/sessions",
        headers={"X-CSRF-Token": csrf},
        json={
            "email": "buyer@example.com",
            "shippingAddress": {"firstName": "Test", "lastName": "Buyer", "address1": "1 Test St", "region": "Tokyo", "city": "Tokyo", "postalCode": "1000001", "phone": "+81 90 0000 0000", "countryCode": "JP"},
            "shippingMethod": "standard", "paymentMethod": "card", "currency": "USD",
            "items": [{"variantId": str(variant_id), "quantity": 2}],
            "successUrl": "http://localhost:3000/orders?checkout=success", "cancelUrl": "http://localhost:3000/checkout?checkout=cancelled",
        },
    )

    assert response.status_code == 200, response.json()
    stripe_price = created_sessions[0]["line_items"][0]["price_data"]
    assert stripe_price["currency"] == "usd"
    assert stripe_price["unit_amount"] == 1005
    async with session_factory() as db:
        order = await db.scalar(select(Order).where(Order.stripe_session_id == "cs_test_ponyo_usd").options(selectinload(Order.items)))
        assert order and order.currency == "USD" and order.total_amount == 2010
        assert order.items[0].currency == "USD" and order.items[0].unit_price == 1005


@pytest.mark.asyncio
async def test_pending_duplicate_registration_resends_without_overwriting_owner(test_client, verification_mail):
    client, session_factory = test_client
    first = await auth_post(client, "register", registration_payload(marketingOptIn=True))
    assert first.status_code == 200
    async with session_factory() as db:
        owner = await db.scalar(select(Customer))
        owner_id, original_hash = owner.id, owner.password_hash

    duplicate = await auth_post(client, "register", registration_payload(
        email="  BUYER@EXAMPLE.COM  ", firstName="Intruder", lastName="Changed",
        password="replacement-password-456", marketingOptIn=False,
    ))
    assert duplicate.status_code == 200
    assert duplicate.json() == first.json() == {
        "data": {"accepted": True, "emailVerificationRequired": True},
    }
    assert client.cookies.get(settings.session_cookie_name) is None
    assert [email for email, _ in verification_mail] == ["buyer@example.com"] * 2
    assert verification_mail[0][1] != verification_mail[1][1]
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Customer)) == 1
        owner = await db.get(Customer, owner_id)
        assert (owner.first_name, owner.last_name, owner.marketing_opt_in) == ("Test", "Buyer", True)
        assert owner.password_hash == original_hash
        assert verify_password("valid-password-123", owner.password_hash)
        assert not verify_password("replacement-password-456", owner.password_hash)
        tokens = list((await db.scalars(select(EmailVerificationToken))).all())
        assert len(tokens) == 2
        assert all(token.used_at is None for token in tokens)
        assert {token.token_hash for token in tokens} == {
            hashlib.sha256(verification_token(delivery).encode()).hexdigest()
            for delivery in verification_mail
        }


@pytest.mark.asyncio
@pytest.mark.parametrize("recovery_path", ["register", "verify-email/resend"])
async def test_registration_mail_failure_keeps_pending_account_and_allows_recovery(
    test_client, monkeypatch, recovery_path,
):
    client, session_factory = test_client
    deliveries = []
    delivery_succeeds = False

    async def deliver(email, url):
        deliveries.append((email, url))
        return delivery_succeeds

    monkeypatch.setattr("app.routers.auth.send_verification_email", deliver)
    failed = await auth_post(client, "register", registration_payload())
    assert failed.status_code == 503
    assert failed.json()["error"]["code"] == "verification_email_delivery_failed"
    assert client.cookies.get(settings.session_cookie_name) is None
    async with session_factory() as db:
        customer = await db.scalar(select(Customer))
        assert customer is not None and customer.email_verified is False
        customer_id, password_hash = customer.id, customer.password_hash
        token = await db.scalar(select(EmailVerificationToken))
        assert token.customer_id == customer_id and token.used_at is not None
        assert token.token_hash == hashlib.sha256(verification_token(deliveries[0]).encode()).hexdigest()

    rejected = await auth_post(client, "verify-email/confirm", {"token": verification_token(deliveries[0])})
    assert rejected.status_code == 400
    login = await auth_post(client, "login", {"email": "buyer@example.com", "password": "valid-password-123"})
    assert login.status_code == 403
    assert login.json()["error"]["code"] == "email_verification_required"

    delivery_succeeds = True
    recovery_body = registration_payload(firstName="Changed", password="changed-password-456")
    if recovery_path == "verify-email/resend":
        recovery_body = {"email": "BUYER@example.com"}
    recovered = await auth_post(client, recovery_path, recovery_body)
    assert recovered.status_code == 200
    assert recovered.json()["data"]["accepted"] is True
    assert len(deliveries) == 2
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Customer)) == 1
        customer = await db.get(Customer, customer_id)
        assert customer.first_name == "Test" and customer.password_hash == password_hash
        tokens = list((await db.scalars(select(EmailVerificationToken))).all())
        assert len(tokens) == 2
        assert sum(token.used_at is None for token in tokens) == 1
    confirmed = await auth_post(client, "verify-email/confirm", {"token": verification_token(deliveries[-1])})
    assert confirmed.status_code == 200
    login = await auth_post(client, "login", {"email": "buyer@example.com", "password": "valid-password-123"})
    assert login.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("retry_path", ["register", "verify-email/resend"])
async def test_failed_resend_uses_failed_token_but_preserves_previously_delivered_link(
    test_client, verification_mail, monkeypatch, retry_path,
):
    client, session_factory = test_client
    assert (await auth_post(client, "register", registration_payload())).status_code == 200
    old_token = verification_token(verification_mail[0])

    async def fail_delivery(email, url):
        verification_mail.append((email, url))
        return False

    monkeypatch.setattr("app.routers.auth.send_verification_email", fail_delivery)
    body = registration_payload() if retry_path == "register" else {"email": "buyer@example.com"}
    failed = await auth_post(client, retry_path, body)
    assert failed.status_code == 503
    assert failed.json()["error"]["code"] == "verification_email_delivery_failed"
    async with session_factory() as db:
        by_hash = {token.token_hash: token for token in (await db.scalars(select(EmailVerificationToken))).all()}
        assert len(by_hash) == 2
        assert by_hash[hashlib.sha256(old_token.encode()).hexdigest()].used_at is None
        assert by_hash[hashlib.sha256(verification_token(verification_mail[-1]).encode()).hexdigest()].used_at is not None
        assert (await db.scalar(select(Customer))).email_verified is False
    assert (await auth_post(client, "verify-email/confirm", {
        "token": verification_token(verification_mail[-1]),
    })).status_code == 400
    assert (await auth_post(client, "verify-email/confirm", {"token": old_token})).status_code == 200


@pytest.mark.asyncio
async def test_missing_and_verified_resend_do_not_send_or_create_tokens(test_client, verification_mail):
    client, session_factory = test_client
    await seed_customer_session(client, session_factory)
    client.cookies.clear()
    for email in ("missing@example.com", "BUYER@example.com"):
        response = await auth_post(client, "verify-email/resend", {"email": email})
        assert response.status_code == 200
        assert response.json() == {"data": {"accepted": True}}
    duplicate = await auth_post(client, "register", registration_payload(email="BUYER@example.com"))
    assert duplicate.status_code == 409
    assert verification_mail == []
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(EmailVerificationToken)) == 0
        assert await db.scalar(select(func.count()).select_from(Customer)) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("token_state", ["expired", "invalid", "used"])
async def test_verification_rejects_unusable_tokens_without_verifying_customer(
    test_client, verification_mail, token_state,
):
    client, session_factory = test_client
    assert (await auth_post(client, "register", registration_payload())).status_code == 200
    raw_token = verification_token(verification_mail[0])
    async with session_factory() as db:
        token = await db.scalar(select(EmailVerificationToken))
        if token_state == "expired":
            token.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        elif token_state == "used":
            token.used_at = datetime.now(timezone.utc)
        await db.commit()
    if token_state == "invalid":
        raw_token = "unknown-token-" + "x" * 32
    response = await auth_post(client, "verify-email/confirm", {"token": raw_token})
    assert response.status_code == 400
    assert response.json()["error"]["message"] == "This verification link is invalid or has expired."
    assert client.cookies.get(settings.session_cookie_name) is None
    async with session_factory() as db:
        assert (await db.scalar(select(Customer))).email_verified is False
        if token_state != "used":
            assert (await db.scalar(select(EmailVerificationToken))).used_at is None


@pytest.mark.asyncio
async def test_confirmation_is_single_use_and_invalidates_only_customer_siblings(test_client, verification_mail):
    client, session_factory = test_client
    assert (await auth_post(client, "register", registration_payload())).status_code == 200
    assert (await auth_post(client, "verify-email/resend", {"email": "buyer@example.com"})).status_code == 200
    assert (await auth_post(client, "register", registration_payload(email="other@example.com"))).status_code == 200
    first_token, sibling_token, other_token = map(verification_token, verification_mail)
    confirmed = await auth_post(client, "verify-email/confirm", {"token": first_token})
    assert confirmed.status_code == 200
    assert confirmed.json() == {"data": {"accepted": True}}
    assert client.cookies.get(settings.session_cookie_name) is None
    for token in (first_token, sibling_token):
        assert (await auth_post(client, "verify-email/confirm", {"token": token})).status_code == 400
    async with session_factory() as db:
        customers = {customer.email: customer for customer in (await db.scalars(select(Customer))).all()}
        assert customers["buyer@example.com"].email_verified is True
        assert customers["other@example.com"].email_verified is False
        tokens = list((await db.scalars(select(EmailVerificationToken))).all())
        owner_tokens = [token for token in tokens if token.customer_id == customers["buyer@example.com"].id]
        assert len(owner_tokens) == 2
        assert all(token.used_at is not None for token in owner_tokens)
        assert owner_tokens[0].used_at == owner_tokens[1].used_at
        assert next(token for token in tokens if token.customer_id == customers["other@example.com"].id).used_at is None
    assert (await auth_post(client, "verify-email/confirm", {"token": other_token})).status_code == 200


@pytest.mark.asyncio
async def test_verification_rechecks_expiry_when_atomically_claiming_token(test_client, verification_mail, monkeypatch):
    client, session_factory = test_client
    assert (await auth_post(client, "register", registration_payload())).status_code == 200
    now = datetime.now(timezone.utc)
    times = iter((now, now + timedelta(days=2)))
    monkeypatch.setattr("app.routers.auth.datetime", SimpleNamespace(now=lambda _tz: next(times)))
    response = await auth_post(client, "verify-email/confirm", {"token": verification_token(verification_mail[0])})
    assert response.status_code == 400
    async with session_factory() as db:
        assert (await db.scalar(select(Customer))).email_verified is False
        assert (await db.scalar(select(EmailVerificationToken))).used_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["register", "login", "verify-email/resend", "password-reset"])
@pytest.mark.parametrize("email", ["not-an-email", "buyer@@example.com", "buyer@example.com\r\nBcc: other@example.com"])
async def test_auth_rejects_invalid_email_without_persistence_or_mail(test_client, verification_mail, path, email):
    client, session_factory = test_client
    response = await auth_post(client, path, registration_payload(email=email))
    assert response.status_code == 422
    assert verification_mail == []
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Customer)) == 0
        assert await db.scalar(select(func.count()).select_from(EmailVerificationToken)) == 0


@pytest.mark.asyncio
async def test_auth_normalizes_email_for_registration_resend_and_login(test_client, verification_mail):
    client, session_factory = test_client
    assert (await auth_post(client, "register", registration_payload(email="  BuYeR@EXAMPLE.COM  "))).status_code == 200
    assert (await auth_post(client, "verify-email/resend", {"email": "  BUYER@EXAMPLE.COM  "})).status_code == 200
    assert [email for email, _ in verification_mail] == ["buyer@example.com"] * 2
    assert (await auth_post(client, "verify-email/confirm", {"token": verification_token(verification_mail[-1])})).status_code == 200
    login = await auth_post(client, "login", {"email": "  BUYER@EXAMPLE.COM  ", "password": "valid-password-123"})
    assert login.status_code == 200
    assert login.json()["data"]["customer"]["email"] == "buyer@example.com"
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(Customer)) == 1
        assert (await db.scalar(select(Customer))).email == "buyer@example.com"


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy_session", [False, True], ids=["guest", "unverified-legacy-session"])
async def test_account_orders_and_checkout_block_unverified_and_guest_access(test_client, monkeypatch, legacy_session):
    client, session_factory = test_client
    product_id, variant_id = await add_product(session_factory)
    if legacy_session:
        await seed_customer_session(client, session_factory, verified=False)
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_dummy")
    payment_create = MagicMock(side_effect=AssertionError("Denied checkout must not call Stripe"))
    monkeypatch.setattr(stripe.checkout.Session, "create", payment_create)
    csrf = await csrf_token(client)
    address_id, order_id = uuid4(), uuid4()
    address = checkout_payload(variant_id)["shippingAddress"]
    requests = [
        ("GET", "/v1/auth/me", None),
        ("PATCH", "/v1/auth/me", {"firstName": "Changed", "lastName": "Name"}),
        ("GET", "/v1/auth/addresses", None),
        ("POST", "/v1/auth/addresses", address),
        ("PATCH", f"/v1/auth/addresses/{address_id}", address),
        ("DELETE", f"/v1/auth/addresses/{address_id}", None),
        ("GET", "/v1/auth/wishlist", None),
        ("PUT", "/v1/auth/wishlist", {"productSlugs": ["test-bunny"]}),
        ("GET", "/v1/orders", None),
        ("GET", f"/v1/orders/{order_id}", None),
        ("POST", f"/v1/products/{product_id}/reviews", {"rating": 5}),
        ("POST", "/v1/checkout/sessions", checkout_payload(variant_id)),
    ]
    for method, path, body in requests:
        response = await client.request(method, path, headers={"X-CSRF-Token": csrf}, json=body)
        assert response.status_code == (403 if legacy_session else 401), (method, path, response.json())
        if legacy_session:
            assert response.json()["error"]["code"] == "email_verification_required"
    payment_create.assert_not_called()
    async with session_factory() as db:
        assert (await db.get(ProductVariant, variant_id)).stock_quantity == 4
        for model in (Order, OrderItem, CustomerAddress, WishlistItem, ProductReview, OutboxEvent):
            assert await db.scalar(select(func.count()).select_from(model)) == 0
        if legacy_session:
            assert (await db.scalar(select(Customer))).first_name == "Test"


@pytest.mark.asyncio
async def test_optional_customer_guard_rejects_unverified_legacy_session(test_client):
    client, session_factory = test_client
    product_id, _ = await add_product(session_factory)
    await seed_customer_session(client, session_factory, verified=False)
    csrf = await csrf_token(client)
    response = await client.post(
        f"/v1/products/{product_id}/waitlist", headers={"X-CSRF-Token": csrf},
        json={"email": "buyer@example.com", "firstName": "Test"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "email_verification_required"
    async with session_factory() as db:
        assert await db.scalar(select(func.count()).select_from(ProductWaitlistEntry)) == 0
        assert await db.scalar(select(func.count()).select_from(OutboxEvent)) == 0


@pytest.mark.asyncio
async def test_checkout_email_mismatch_has_no_stock_order_or_payment_effects(test_client, monkeypatch):
    client, session_factory = test_client
    await seed_customer_session(client, session_factory)
    _, variant_id = await add_product(session_factory)
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_dummy")
    monkeypatch.setattr(settings, "environment", "local")
    monkeypatch.setattr(settings, "frontend_origins", "http://localhost:3000")
    payment_create = MagicMock(side_effect=AssertionError("Email mismatch must not call Stripe"))
    monkeypatch.setattr(stripe.checkout.Session, "create", payment_create)
    response = await client.post(
        "/v1/checkout/sessions", headers={"X-CSRF-Token": await csrf_token(client)},
        json=checkout_payload(variant_id, email="other@example.com"),
    )
    assert response.status_code == 422
    assert response.json()["error"]["message"] == "Use your verified account email for checkout."
    payment_create.assert_not_called()
    async with session_factory() as db:
        assert (await db.get(ProductVariant, variant_id)).stock_quantity == 4
        for model in (Order, OrderItem, OutboxEvent):
            assert await db.scalar(select(func.count()).select_from(model)) == 0


@pytest.fixture
def smtp_transport(monkeypatch):
    for name, value in {
        "environment": "test", "smtp_host": "smtp.example.test", "smtp_port": 587,
        "smtp_username": "smtp-user", "smtp_password": "smtp-test-password",
        "smtp_from_email": "accounts@example.com", "smtp_starttls": True,
        "smtp_timeout_seconds": 3,
    }.items():
        monkeypatch.setattr(settings, name, value)
    transport = MagicMock()
    monkeypatch.setattr("app.email_notifications.smtplib.SMTP", transport)
    return transport


@pytest.mark.asyncio
@pytest.mark.parametrize("sender,subject", [
    (send_verification_email, "Verify your Ponyo email"),
    (send_password_reset_email, "Reset your Ponyo password"),
])
@pytest.mark.parametrize("starttls", [True, False])
async def test_auth_smtp_message_and_transport_are_correct(smtp_transport, monkeypatch, sender, subject, starttls):
    monkeypatch.setattr(settings, "smtp_starttls", starttls)
    url = "https://shop.example.test/account/verify-email?token=transport-test-token"
    assert await sender("buyer@example.com", url) is True
    smtp_transport.assert_called_once_with("smtp.example.test", 587, timeout=3)
    smtp = smtp_transport.return_value.__enter__.return_value
    assert smtp.ehlo.call_count == (2 if starttls else 1)
    if starttls:
        smtp.starttls.assert_called_once()
        assert smtp.starttls.call_args.kwargs["context"] is not None
    else:
        smtp.starttls.assert_not_called()
    smtp.login.assert_called_once_with("smtp-user", "smtp-test-password")
    smtp.send_message.assert_called_once()
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "buyer@example.com"
    assert message["From"].addresses[0].addr_spec == "accounts@example.com"
    assert message["Subject"] == subject
    assert url in message.get_body(preferencelist=("plain",)).get_content()


@pytest.mark.asyncio
async def test_verification_sender_uses_public_storefront_logo(smtp_transport, monkeypatch):
    monkeypatch.setattr(settings, "storefront_base_url", "https://shop.example.test")
    url = "https://shop.example.test/account/verify-email?token=transport-test-token"
    assert await send_verification_email("buyer@example.com", url) is True
    smtp = smtp_transport.return_value.__enter__.return_value
    message = smtp.send_message.call_args.args[0]
    html = message.get_body(preferencelist=("html",)).get_content()
    assert 'src="https://shop.example.test/ponyo-email-jellyfish.png"' in html
    assert f'href="{url}"' in html
    assert "cid:" not in html


@pytest.mark.asyncio
@pytest.mark.parametrize("sender", [send_verification_email, send_password_reset_email])
@pytest.mark.parametrize("failure_stage", ["connect", "starttls", "login", "send_message"])
async def test_auth_smtp_failures_return_false(smtp_transport, sender, failure_stage):
    error = smtplib.SMTPException("Simulated transport failure")
    if failure_stage == "connect":
        smtp_transport.side_effect = error
    else:
        smtp = smtp_transport.return_value.__enter__.return_value
        getattr(smtp, failure_stage).side_effect = error
    assert await sender("buyer@example.com", "https://shop.example.test/account?token=test-token") is False


@pytest.mark.asyncio
async def test_stripe_webhook_is_signature_verified_and_idempotent(test_client, monkeypatch):
    client, session_factory = test_client
    _, variant_id = await add_product(session_factory, price=1500, stock=2)
    order_id = uuid4()
    async with session_factory() as db:
        order = Order(
            id=order_id, order_number="PNY-TEST-ORDER", customer_email="buyer@example.com",
            status="pending_payment", payment_status="unpaid", fulfillment_status="unfulfilled",
            total_amount=1500, currency="JPY", shipping_address={"countryCode": "JP"},
            shipping_method="standard", payment_method="card", payment_provider="stripe",
            stripe_session_id="cs_test_webhook",
        )
        order.items.append(OrderItem(
            variant_id=variant_id, product_name="Test Bunny", supplier_name="Ponyo",
            image_url="https://example.test/bunny.png", image_alt="Bunny", quantity=1,
            unit_price=1500, currency="JPY",
        ))
        db.add(order)
        await db.commit()

    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")
    event = {
        "id": "evt_ponyo_test_paid",
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_test_webhook", "client_reference_id": str(order_id),
            "metadata": {"ponyo_order_id": str(order_id)}, "payment_status": "paid",
            "amount_total": 1500, "currency": "jpy",
        }},
    }
    monkeypatch.setattr(stripe.Webhook, "construct_event", staticmethod(lambda *_args: event))
    first = await client.post("/v1/webhooks/stripe", content=b"signed-body", headers={"stripe-signature": "test-signature"})
    second = await client.post("/v1/webhooks/stripe", content=b"signed-body", headers={"stripe-signature": "test-signature"})
    assert first.status_code == second.status_code == 200
    async with session_factory() as db:
        order = await db.get(Order, order_id)
        assert order.payment_status == "paid"
        assert order.fulfillment_status == "queued"
        assert await db.get(ProcessedWebhook, "evt_ponyo_test_paid") is not None
        events = list((await db.scalars(select(OutboxEvent))).all())
        assert len(events) == 1
        assert events[0].event_type == "order.payment_succeeded"
