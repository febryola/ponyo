from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
import stripe
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app
from app.models import ContactRequest as ContactRequestModel
from app.models import CustomerAddress, ProductReview, ProductWaitlistEntry, WishlistItem
from app.models import AppTranslation, Order, OrderItem, OutboxEvent, ProcessedWebhook, Product, ProductTranslation, ProductVariant
from app.config import settings


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
    monkeypatch.setattr("app.translations._aws_credentials_available", lambda: True)
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
async def test_ui_copy_translation_is_cached_and_invalidated_by_source_changes(test_client, monkeypatch):
    client, session_factory = test_client
    calls = []

    def fake_translate(text, target_language):
        calls.append((text, target_language))
        return f"{target_language}:{text}"

    monkeypatch.setattr(settings, "translation_provider", "aws_translate")
    monkeypatch.setattr("app.translations._aws_credentials_available", lambda: True)
    monkeypatch.setattr("app.translations._translate_with_aws", fake_translate)
    payload = {"locale": "ja", "entries": [{"key": "home.test", "text": "Find a friend"}]}

    first = await client.post("/v1/localization/translations", json=payload)
    second = await client.post("/v1/localization/translations", json=payload)
    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["translations"]["home.test"] == "ja:Find a friend"
    assert second.json()["data"]["translations"]["home.test"] == "ja:Find a friend"
    assert len(calls) == 1

    payload["entries"][0]["text"] = "Find a new friend"
    updated = await client.post("/v1/localization/translations", json=payload)
    assert updated.json()["data"]["translations"]["home.test"] == "ja:Find a new friend"
    assert len(calls) == 2
    async with session_factory() as db:
        cached = await db.scalar(select(AppTranslation).where(AppTranslation.translation_key == "home.test"))
        assert cached is not None
        assert cached.translated_text == "ja:Find a new friend"


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
    customer_id = registration.json()["data"]["customer"]["id"]
    order_id = uuid4()
    async with session_factory() as db:
        order = Order(
            id=order_id, order_number="PNY-TRACK-TEST", customer_id=UUID(customer_id),
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
    client, _ = test_client
    csrf = await csrf_token(client)
    payload = {"firstName": "Test", "lastName": "Buyer", "email": "already@example.com", "password": "valid-password-123", "marketingOptIn": False}
    first = await client.post("/v1/auth/register", headers={"X-CSRF-Token": csrf}, json=payload)
    csrf = await csrf_token(client)
    second = await client.post("/v1/auth/register", headers={"X-CSRF-Token": csrf}, json=payload)
    assert first.status_code == 200
    assert second.status_code == 409
    assert "already exists" in second.json()["error"]["message"]


@pytest.mark.asyncio
async def test_register_and_authenticated_order_history(test_client):
    client, _ = test_client
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/auth/register",
        headers={"X-CSRF-Token": csrf},
        json={"firstName": "Test", "lastName": "Customer", "email": "test@example.com", "password": "valid-password-123", "marketingOptIn": False},
    )
    assert response.status_code == 200
    assert response.json()["data"]["customer"]["email"] == "test@example.com"
    csrf_after_login = client.cookies.get("ponyo_csrf")
    orders = await client.get("/v1/orders")
    assert orders.status_code == 200
    assert orders.json() == {"data": []}
    logout = await client.post("/v1/auth/logout", headers={"X-CSRF-Token": csrf_after_login})
    assert logout.status_code == 200
    assert client.cookies.get("ponyo_session") is None


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
async def test_checkout_refuses_missing_stripe_config(test_client):
    client, _ = test_client
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


@pytest.mark.asyncio
async def test_checkout_converts_selected_currency_for_stripe_and_order(test_client, monkeypatch):
    client, session_factory = test_client
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
