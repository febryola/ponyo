"""Provider mocks and disposable databases only; never use the application DB."""

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import reservation_expiry as recovery
from app.models import (
    Base, Order, OrderItem, OrderStatusHistory, OutboxEvent, Product,
    ProductVariant, Supplier, SupplierInventory, SupplierOffer,
)

NOW = datetime(2026, 11, 11, 12, tzinfo=timezone.utc)
pytestmark = pytest.mark.asyncio


@pytest.fixture
async def flow(monkeypatch):
    # Guard every external entry point, even tests injecting their own provider.
    retrieve = Mock(side_effect=AssertionError("Unmocked Stripe lookup"))
    expire = Mock(side_effect=AssertionError("Unmocked Stripe expiry"))
    monkeypatch.setattr(recovery.stripe.checkout.Session, "retrieve", retrieve)
    monkeypatch.setattr(recovery.stripe.checkout.Session, "expire", expire)
    monkeypatch.setattr(recovery.settings, "stripe_secret_key", "sk_test_not_real")
    monkeypatch.setattr(recovery.stripe, "api_key", None)
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as db:
        product = Product(slug="expiry", name="Expiry", price_amount=100, image_url="/test.jpg")
        supplier = Supplier(code="EXPIRY", name="Expiry supplier")
        db.add_all([product, supplier])
        await db.flush()
        variant = ProductVariant(product_id=product.id, price_amount=100, stock_quantity=8)
        db.add(variant)
        await db.flush()
        offer = SupplierOffer(supplier_id=supplier.id, variant_id=variant.id,
                              supplier_sku="EXPIRY", cost_amount=50, currency="JPY")
        db.add(offer)
        await db.flush()
        inventory = SupplierInventory(offer_id=offer.id, on_hand=10, reserved=2)
        order = Order(order_number="PNY-EXPIRY", customer_email="expiry@example.com",
                      total_amount=200, shipping_address={}, shipping_method="standard",
                      payment_method="card", stripe_session_id="cs_expiry",
                      reservation_expires_at=NOW - timedelta(seconds=1))
        db.add_all([inventory, order])
        await db.flush()
        db.add(OrderItem(order_id=order.id, variant_id=variant.id, supplier_offer_id=offer.id,
                         product_name="Expiry", image_url="/test.jpg", quantity=2, unit_price=100))
        await db.commit()
        result = SimpleNamespace(factory=factory, order_id=order.id, variant_id=variant.id,
                                 inventory_id=inventory.id, retrieve=retrieve, expire=expire)
    try:
        yield result
    finally:
        await engine.dispose()


def session(**changes):
    return {"id": "cs_expiry", "status": "expired", "payment_status": "unpaid", **changes}


async def run(flow, provider=None):
    async with flow.factory() as db:
        return await recovery.expire_reservations(db, now=NOW, provider=provider)


async def state(flow, *, released=False):
    async with flow.factory() as db:
        order = await db.get(Order, flow.order_id)
        variant = await db.get(ProductVariant, flow.variant_id)
        inventory = await db.get(SupplierInventory, flow.inventory_id)
        assert (order.status, order.payment_status) == (
            ("cancelled", "failed") if released else ("pending_payment", "unpaid")
        )
        assert variant.stock_quantity == (10 if released else 8)
        assert (inventory.on_hand, inventory.reserved) == (10, 0 if released else 2)
        assert inventory.last_synced_at is None
        assert await db.scalar(select(func.count()).select_from(OrderStatusHistory)) == int(released)
        assert await db.scalar(select(func.count()).select_from(OutboxEvent)) == int(released)
        if released:
            history = await db.scalar(select(OrderStatusHistory))
            assert history.event_key == f"reservation.expired:{order.id}"
            assert (await db.scalar(select(OutboxEvent))).event_type == "order.reservation_expired"


async def test_confirmed_expired_releases_once_without_on_hand_decrement(flow):
    flow.retrieve.return_value = session(metadata={"ponyo_order_id": str(flow.order_id)})
    flow.retrieve.side_effect = None
    assert await run(flow) == 1
    assert recovery.stripe.api_key == "sk_test_not_real"
    assert await run(flow) == 0
    flow.retrieve.assert_called_once_with("cs_expiry")
    flow.expire.assert_not_called()
    await state(flow, released=True)


async def test_open_session_must_be_confirmed_expired(flow):
    flow.retrieve.side_effect = flow.expire.side_effect = None
    flow.retrieve.return_value = session(status="open")
    flow.expire.return_value = session()
    assert await run(flow) == 1
    flow.expire.assert_called_once_with("cs_expiry")
    await state(flow, released=True)


async def test_legacy_item_without_supplier_offer_restores_variant_stock(flow):
    async with flow.factory() as db:
        await db.execute(update(OrderItem).values(supplier_offer_id=None))
        await db.execute(update(SupplierInventory).values(reserved=0))
        await db.commit()
    assert await run(flow, Mock(return_value=session())) == 1
    await state(flow, released=True)


async def test_checkout_persists_actual_provider_deadline(monkeypatch):
    from uuid import UUID
    from app.routers.checkout import create_checkout_session
    from app.schemas import CheckoutSessionRequest

    deadline = int(NOW.timestamp()) + 2300
    provider_session = SimpleNamespace(id="cs_saved", url="https://checkout.stripe.test/saved", expires_at=deadline)
    monkeypatch.setattr("app.routers.checkout.stripe.checkout.Session.create", Mock(return_value=provider_session))
    monkeypatch.setattr("app.routers.checkout.require_csrf", Mock())
    monkeypatch.setattr("app.routers.checkout.valid_storefront_url", lambda value: value)
    monkeypatch.setattr(recovery.settings, "stripe_secret_key", "sk_test_not_real")
    monkeypatch.setattr(recovery.stripe, "api_key", None)
    monkeypatch.setattr("app.routers.checkout.reserve_supplier_stock", AsyncMock(return_value=None))
    variant_id = uuid4()
    product = SimpleNamespace(published=True, name="Expiry", image_url="/test.jpg", image_alt="", supplier_name="Ponyo")
    variant = SimpleNamespace(id=variant_id, currency="JPY", price_amount=1500, stock_quantity=10, product=product)
    db = SimpleNamespace(scalars=AsyncMock(return_value=[variant]), execute=AsyncMock(return_value=SimpleNamespace(rowcount=1)), add=Mock(), commit=AsyncMock(), rollback=AsyncMock())
    customer = SimpleNamespace(id=uuid4(), email="expiry@example.com")
    payload = {
        "email": customer.email, "currency": "JPY",
        "shippingAddress": {
            "firstName": "Expiry", "lastName": "Test", "address1": "1 Test St",
            "region": "Tokyo", "city": "Tokyo", "postalCode": "1000001", "countryCode": "JP",
            "phone": "+81 90 0000 0000",
        },
        "shippingMethod": "standard", "paymentMethod": "card",
        "items": [{"variantId": str(variant_id), "quantity": 1}],
        "successUrl": "http://localhost:3000/orders", "cancelUrl": "http://localhost:3000/checkout",
    }
    result = await create_checkout_session(CheckoutSessionRequest.model_validate(payload), Mock(), db, customer)
    order = next(call.args[0] for call in db.add.call_args_list if isinstance(call.args[0], Order))
    assert order.id == UUID(result["data"]["orderId"])
    assert order.stripe_session_id == "cs_saved"
    assert order.reservation_expires_at == datetime.fromtimestamp(deadline, timezone.utc)
    assert result["data"]["expiresAt"] == order.reservation_expires_at.isoformat()
    db.commit.assert_awaited_once()


@pytest.mark.parametrize("response", [
    session(status="complete"), session(status="completed"),
    session(payment_status="paid"), session(status="open", payment_status="paid"),
    session(payment_status="no_payment_required"), session(id="cs_wrong"),
    session(status=None), session(payment_status=None), {}, None,
    session(metadata={"ponyo_order_id": str(uuid4())}),
    session(client_reference_id=str(uuid4())), session(metadata="malformed"),
])
async def test_unconfirmed_malformed_paid_or_completed_keeps_stock(flow, response):
    flow.retrieve.side_effect = None
    flow.retrieve.return_value = response
    assert await run(flow) == 0
    flow.expire.assert_not_called()
    await state(flow)


@pytest.mark.parametrize("response", [session(status="open"), session(payment_status="paid"),
                                       session(id="cs_wrong"), {}, None])
async def test_expire_response_must_confirm_expired_unpaid(flow, response):
    flow.retrieve.side_effect = flow.expire.side_effect = None
    flow.retrieve.return_value = session(status="open")
    flow.expire.return_value = response
    assert await run(flow) == 0
    await state(flow)


@pytest.mark.parametrize("operation", ["retrieve", "expire"])
async def test_provider_error_never_releases_on_ttl_and_logs_no_secrets(flow, caplog, operation):
    flow.retrieve.side_effect = None
    flow.retrieve.return_value = session(status="open")
    getattr(flow, operation).side_effect = RuntimeError("sk_secret_sensitive_payload")
    assert await run(flow) == 0
    assert "RuntimeError" in caplog.text
    assert "sk_secret_sensitive_payload" not in caplog.text
    await state(flow)


@pytest.mark.parametrize("deadline", [None, NOW + timedelta(seconds=1)])
async def test_legacy_null_and_future_deadlines_untouched(flow, deadline):
    async with flow.factory() as db:
        await db.execute(update(Order).values(reservation_expires_at=deadline))
        await db.commit()
    provider = Mock(return_value=session())
    assert await run(flow, provider) == 0
    provider.assert_not_called()
    await state(flow)


async def test_paid_order_not_selected(flow):
    async with flow.factory() as db:
        await db.execute(update(Order).values(status="processing", payment_status="paid"))
        await db.commit()
    provider = Mock(return_value=session())
    assert await run(flow, provider) == 0
    provider.assert_not_called()
    async with flow.factory() as db:
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 8
        assert (await db.get(SupplierInventory, flow.inventory_id)).reserved == 2


async def test_paid_webhook_between_provider_check_and_claim_is_rechecked(flow, monkeypatch):
    async with flow.factory() as db:
        scalar = db.scalar

        async def race(statement, *args, **kwargs):
            await db.execute(update(Order).values(status="processing", payment_status="paid"))
            await db.commit()
            return await scalar(statement, *args, **kwargs)

        monkeypatch.setattr(db, "scalar", race)
        assert await recovery.expire_reservations(db, NOW, Mock(return_value=session())) == 0
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).payment_status == "paid"
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 8
        assert (await db.get(SupplierInventory, flow.inventory_id)).reserved == 2


async def test_settlement_error_rolls_back_entire_order_and_continues(flow, monkeypatch):
    async with flow.factory() as db:
        other = Order(order_number="PNY-OTHER", customer_email="other@example.com", total_amount=0,
                      shipping_address={}, shipping_method="standard", payment_method="card",
                      stripe_session_id="cs_other", reservation_expires_at=NOW)
        db.add(other)
        await db.commit()
        other_id = other.id
    monkeypatch.setattr(recovery, "settle_supplier_stock", AsyncMock(side_effect=RuntimeError("broken")))
    assert await run(flow, lambda identifier: session(id=identifier)) == 1
    async with flow.factory() as db:
        assert (await db.get(Order, flow.order_id)).status == "pending_payment"
        assert (await db.get(Order, other_id)).status == "cancelled"
        assert (await db.get(ProductVariant, flow.variant_id)).stock_quantity == 8
        assert (await db.get(SupplierInventory, flow.inventory_id)).reserved == 2
        assert await db.scalar(select(func.count()).select_from(OrderStatusHistory)) == 1


async def test_batch_is_bounded_at_100(flow):
    async with flow.factory() as db:
        for index in range(105):
            db.add(Order(order_number=f"BATCH-{index}", customer_email="batch@example.com", total_amount=0,
                         shipping_address={}, shipping_method="standard", payment_method="card",
                         stripe_session_id=f"cs_batch_{index}", reservation_expires_at=NOW))
        await db.commit()
    provider = Mock(side_effect=lambda identifier: session(id=identifier))
    assert await run(flow, provider) == 100
    assert provider.call_count == 100


async def test_postgres_claim_and_variant_lock_order_and_atomic_increment(flow, monkeypatch):
    statements = []
    async with flow.factory() as db:
        for method in ("execute", "scalar", "scalars"):
            original = getattr(db, method)

            async def capture(statement, *args, _original=original, **kwargs):
                statements.append(str(statement.compile(dialect=postgresql.dialect())))
                return await _original(statement, *args, **kwargs)

            monkeypatch.setattr(db, method, capture)
        assert await recovery.expire_reservations(db, NOW, Mock(return_value=session())) == 1
    claim = next(sql for sql in statements if sql.startswith("UPDATE orders"))
    assert all(part in claim for part in ("status =", "payment_status =", "reservation_expires_at <="))
    assert any("FROM orders" in sql and "FOR UPDATE" in sql for sql in statements)
    variant_lock = next(i for i, sql in enumerate(statements)
                        if "ORDER BY product_variants.id FOR UPDATE" in sql)
    supplier_update = next(i for i, sql in enumerate(statements) if sql.startswith("UPDATE supplier_inventory"))
    assert variant_lock < supplier_update
    assert any("stock_quantity=(product_variants.stock_quantity +" in sql for sql in statements)


async def test_worker_retries_and_cancellation_closes_session(flow, monkeypatch, caplog):
    calls = 0

    async def failing(db):
        nonlocal calls
        calls += 1
        raise RuntimeError("secret_payload")

    async def stop_after_retry(seconds):
        assert seconds == 60
        if calls == 2:
            raise asyncio.CancelledError

    monkeypatch.setattr(recovery, "expire_reservations", failing)
    monkeypatch.setattr(recovery.asyncio, "sleep", stop_after_retry)
    with pytest.raises(asyncio.CancelledError):
        await recovery.recover_expired_reservations(flow.factory)
    assert calls == 2
    assert "RuntimeError" in caplog.text and "secret_payload" not in caplog.text


@pytest.mark.parametrize("enabled", [False, True])
async def test_lifespan_optional_worker_cleanup_on_body_error(monkeypatch, enabled):
    from app import main
    from redis.asyncio import Redis

    redis = SimpleNamespace(ping=AsyncMock(), aclose=AsyncMock())
    monkeypatch.setattr(Redis, "from_url", Mock(return_value=redis))
    monkeypatch.setattr(main.settings, "stripe_secret_key", "sk_test_not_real" if enabled else "")
    monkeypatch.setattr(main.settings, "sqs_order_events_url", "")
    worker = AsyncMock()
    monkeypatch.setattr(main, "recover_expired_reservations", worker)
    dispose = AsyncMock()
    monkeypatch.setattr(main, "engine", SimpleNamespace(dispose=dispose))
    with pytest.raises(RuntimeError, match="body failure"):
        async with main.lifespan(main.app):
            raise RuntimeError("body failure")
    assert worker.call_count == int(enabled)
    redis.aclose.assert_awaited_once()
    dispose.assert_awaited_once()