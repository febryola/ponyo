from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

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
from app.models import Order, OrderItem, OutboxEvent, ProcessedWebhook, Product, ProductVariant
from app.config import settings


async def add_product(session_factory, *, slug="test-bunny", price=1500, stock=4):
    async with session_factory() as db:
        product = Product(
            id=uuid4(), slug=slug, name=slug.title(), description="Soft toy", currency="JPY",
            price_amount=price, availability="available", category_name="Bunnies", supplier_name="Ponyo",
            image_url="https://example.test/bunny.png", image_alt="Bunny", tags=["bunny"], published=True,
        )
        db.add(product)
        await db.flush()
        variant = ProductVariant(product_id=product.id, title="Default", currency="JPY", price_amount=price, stock_quantity=stock, active=True)
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
async def test_checkout_refuses_missing_stripe_config(test_client):
    client, _ = test_client
    csrf = await csrf_token(client)
    response = await client.post(
        "/v1/checkout/sessions",
        headers={"X-CSRF-Token": csrf},
        json={
            "email": "buyer@example.com",
            "shippingAddress": {"firstName": "Test", "lastName": "Buyer", "address1": "1 Test St", "city": "Tokyo", "postalCode": "1000001", "countryCode": "JP"},
            "shippingMethod": "standard", "paymentMethod": "card", "items": [{"variantId": str(uuid4()), "quantity": 1}],
            "successUrl": "http://localhost:3000/orders?checkout=success", "cancelUrl": "http://localhost:3000/checkout?checkout=cancelled",
        },
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "service_unavailable"


@pytest.mark.asyncio
async def test_supplier_contact_request_is_saved_and_queued(test_client):
    client, session_factory = test_client
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
    async with session_factory() as db:
        inquiry = await db.scalar(select(ContactRequestModel))
        event = await db.scalar(select(OutboxEvent).where(OutboxEvent.event_type == "contact.request_received"))
        assert inquiry and inquiry.request_type == "Supplier partnership"
        assert event and "Little Cloud Studio" in event.payload["message"]


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
            "shippingAddress": {"firstName": "Test", "lastName": "Buyer", "address1": "1 Test St", "city": "Tokyo", "postalCode": "1000001", "countryCode": "JP"},
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
            "shippingAddress": {"firstName": "Test", "lastName": "Buyer", "address1": "1 Test St", "city": "Tokyo", "postalCode": "1000001", "countryCode": "JP"},
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
