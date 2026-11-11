"""File-SQLite concurrency and inventory regressions; not PostgreSQL stress tests.

Only the HTTP tests use genuinely concurrent transactions. Supplier rowcount
fallback is a controlled same-transaction interleaving, explicitly not a race
between database connections. No application lifespan, migrations or feed I/O.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, func, select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app import security
from app.config import Settings
from app.db import Base, get_db
from app.inventory import reserve_supplier_stock, restore_variant_stock, settle_supplier_stock
from app.models import (
    Customer, Order, OrderItem, OrderStatusHistory, OutboxEvent, Product,
    ProductVariant, Supplier, SupplierInventory, SupplierOffer,
)
from app.routers import checkout
from app.stock_sync import StockSnapshot, sync_supplier_stock


pytestmark = pytest.mark.asyncio
NOW = datetime(2026, 11, 11, 12, tzinfo=timezone.utc)
OBSERVED = NOW - timedelta(minutes=1)
ORIGIN = "https://storefront.example.test"


@pytest.fixture
async def inventory_db(tmp_path):
    path = tmp_path / "inventory-concurrency.sqlite"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{path.as_posix()}", poolclass=NullPool,
        connect_args={"timeout": 10},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def configure_connection(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=10000")
        cursor.close()

    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with engine.begin() as connection:
            assert (await connection.exec_driver_sql("PRAGMA journal_mode=WAL")).scalar() == "wal"
            await connection.run_sync(Base.metadata.create_all)
        # NullPool supplies physically distinct connections, not StaticPool's
        # shared in-memory connection. Check every request's pragmas below too.
        assert path.is_file()
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture
def safe_checkout_services(monkeypatch):
    settings = Settings(
        _env_file=None, environment="test", database_url="sqlite+aiosqlite:///:memory:",
        database_host=None, database_name=None, database_user=None, database_password=None,
        redis_host=None, redis_password=None, redis_url="", frontend_origins=ORIGIN,
        storefront_base_url=ORIGIN, jwt_secret="inventory-tests-only-secret-at-least-32-chars",
        cookie_secure=False, cookie_domain=None, cookie_samesite="lax",
        stripe_secret_key="sk_test_inventory_not_a_real_key", stripe_webhook_secret=None,
        smtp_host=None, smtp_username=None, smtp_password=None,
        sqs_order_events_url=None, translation_provider="disabled",
    )
    monkeypatch.setattr(checkout, "settings", settings)
    monkeypatch.setattr(security, "settings", settings)
    rates = AsyncMock(return_value={"base": "JPY", "rates": {"JPY": 1, "USD": 0.01}})
    monkeypatch.setattr(checkout, "get_jpy_rates", rates)
    sessions = []

    def create_session(**kwargs):
        session_id = f"cs_test_{uuid4().hex}"
        result = SimpleNamespace(
            id=session_id, url=f"https://checkout.example.test/{session_id}",
            expires_at=kwargs["expires_at"],
        )
        sessions.append(result)
        return result

    create = MagicMock(side_effect=create_session)
    expire = MagicMock()
    # Replace the Stripe namespace rather than mutating the SDK's global key.
    monkeypatch.setattr(checkout, "stripe", SimpleNamespace(
        api_key=None, StripeError=checkout.stripe.StripeError,
        checkout=SimpleNamespace(Session=SimpleNamespace(create=create, expire=expire)),
    ))
    return SimpleNamespace(settings=settings, create=create, expire=expire, rates=rates, sessions=sessions)


async def add_variant(factory, *, stock=1):
    async with factory() as db:
        product = Product(
            slug=uuid4().hex, name="Concurrency toy", description="Test fixture",
            currency="JPY", price_amount=1500, availability="available",
            category_name="Toys", supplier_name="Ponyo", image_url="/images/test.png",
            published=True,
        )
        db.add(product)
        await db.flush()
        variant = ProductVariant(
            product_id=product.id, price_amount=1500, currency="JPY",
            stock_quantity=stock, active=True,
        )
        db.add(variant)
        await db.commit()
        return variant.id


async def add_offer(factory, variant_id, *, on_hand=1, reserved=0,
                    lead=0, active=True, supplier_active=True, currency="JPY"):
    async with factory() as db:
        supplier = Supplier(code=uuid4().hex, name="Isolated supplier", active=supplier_active)
        db.add(supplier)
        await db.flush()
        offer = SupplierOffer(
            supplier_id=supplier.id, variant_id=variant_id, supplier_sku=uuid4().hex,
            cost_amount=750, currency=currency, lead_time_days=lead, active=active,
        )
        db.add(offer)
        await db.flush()
        inventory = SupplierInventory(
            offer_id=offer.id, on_hand=on_hand, reserved=reserved,
            updated_at=NOW - timedelta(days=1),
        )
        db.add(inventory)
        await db.commit()
        return SimpleNamespace(offer_id=offer.id, inventory_id=inventory.id)


async def read_inventory(factory, offer):
    async with factory() as db:
        return await db.get(SupplierInventory, offer.inventory_id)


def checkout_payload(variant_id):
    return {
        "idempotencyKey": str(uuid4()),
        "email": "concurrency@example.com", "currency": "USD",
        "shippingAddress": {
            "firstName": "Test", "lastName": "Buyer", "address1": "1 Test Street",
            "city": "Tokyo", "region": "Tokyo", "postalCode": "1000001",
            "phone": "+81 90 0000 0000", "countryCode": "JP",
        },
        "shippingMethod": "standard", "paymentMethod": "card",
        "items": [{"variantId": str(variant_id), "quantity": 1}],
        "successUrl": f"{ORIGIN}/orders?checkout=success",
        "cancelUrl": f"{ORIGIN}/checkout?checkout=cancelled",
    }


@pytest.mark.parametrize("linked", [False, True], ids=["legacy", "supplier-linked"])
@pytest.mark.parametrize("read_snapshot", [False, True], ids=["driver-default", "explicit-read-snapshot"])
async def test_two_authenticated_http_requests_cannot_buy_the_last_unit(
    inventory_db, safe_checkout_services, monkeypatch, linked, read_snapshot,
):
    factory = inventory_db
    services = safe_checkout_services
    variant_id = await add_variant(factory)
    offer = await add_offer(factory, variant_id) if linked else None
    async with factory() as db:
        customer = Customer(
            email="concurrency@example.com", password_hash="not-used-by-cookie-auth",
            email_verified=True, role="customer", auth_version=0,
        )
        db.add(customer)
        await db.commit()
        customer_id = customer.id

    app = FastAPI()  # No production middleware, workers, SMTP or Redis startup.
    app.state.environment = "test"
    app.state.redis = None
    app.include_router(checkout.router, prefix="/v1")
    barrier = asyncio.Barrier(2)
    request_sessions = []
    connections = []
    errors = []

    async def request_db():
        async with factory() as db:
            request_sessions.append(db)
            connection = await db.connection()
            connections.append(connection.sync_connection.connection.driver_connection)
            assert (await connection.exec_driver_sql("PRAGMA busy_timeout")).scalar() == 10000
            assert (await connection.exec_driver_sql("PRAGMA journal_mode")).scalar() == "wal"
            if read_snapshot:
                # SQLite's legacy driver does not BEGIN for SELECT. Explicit
                # BEGIN also covers real WAL snapshot upgrade contention.
                await connection.exec_driver_sql("BEGIN")
            execute = db.execute

            async def synchronized_execute(statement, *args, **kwargs):
                if getattr(statement, "is_update", False) and statement.table.name == "product_variants":
                    # Both authenticated requests have read stock=1 before
                    # either conditional UPDATE. Never barrier after a write:
                    # the losing writer must be free to wait for the winner.
                    await asyncio.wait_for(barrier.wait(), timeout=10)
                try:
                    return await execute(statement, *args, **kwargs)
                except OperationalError as error:
                    errors.append(str(error.orig))
                    raise

            monkeypatch.setattr(db, "execute", synchronized_execute)
            yield db

    app.dependency_overrides[get_db] = request_db
    csrf = uuid4().hex
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url=ORIGIN,
        ) as client:
            # One genuine verified customer/JWT session shared by both requests;
            # authentication and CSRF checks are not dependency-overridden.
            client.cookies.set(services.settings.session_cookie_name, security.create_session_token(customer_id))
            client.cookies.set(services.settings.csrf_cookie_name, csrf)
            payloads = [checkout_payload(variant_id), checkout_payload(variant_id)]
            responses = await asyncio.wait_for(asyncio.gather(*(
                client.post("/v1/checkout/sessions", json=payload,
                            headers={"X-CSRF-Token": csrf})
                for payload in payloads
            )), timeout=25)
    finally:
        app.dependency_overrides.clear()

    assert len(request_sessions) == 2 and request_sessions[0] is not request_sessions[1]
    assert len(connections) == 2 and connections[0] is not connections[1]
    diagnostics = (
        f"statuses={[response.status_code for response in responses]}; "
        f"bodies={[response.text for response in responses]}; database errors={errors}"
    )
    async with factory() as db:
        variant = await db.get(ProductVariant, variant_id)
        orders = (await db.scalars(select(Order))).all()
        items = (await db.scalars(select(OrderItem))).all()
        assert variant.stock_quantity == 0, f"Last unit must be claimed exactly once: {diagnostics}"
        assert len(orders) == len(items) == 1, "Concurrent checkout oversold or persisted a losing order"
        assert orders[0].customer_id == customer_id
        assert orders[0].stripe_session_id == services.sessions[0].id
        assert orders[0].reservation_expires_at is not None
        assert (items[0].variant_id, items[0].quantity, items[0].supplier_offer_id) == (
            variant_id, 1, offer.offer_id if offer else None,
        )
        assert await db.scalar(select(func.count()).select_from(OrderStatusHistory)) == 1
        assert await db.scalar(select(func.count()).select_from(OutboxEvent)) == 0
    if offer:
        inventory = await read_inventory(factory, offer)
        assert (inventory.on_hand, inventory.reserved) == (1, 1)
    services.create.assert_called_once()
    services.expire.assert_not_called()
    assert services.rates.await_count == 2
    statuses = sorted(response.status_code for response in responses)
    assert statuses in ([200, 409], [200, 503]), (
        f"Expected one success and a handled stock conflict/retry, got {statuses}; "
        f"bodies={[response.text for response in responses]}; database errors={errors}. "
        "A 500 (including SQLite database locked on snapshot upgrade) is an application bug, not an acceptable conflict."
    )


async def test_exhausted_fastest_offer_uses_second_offer(inventory_db):
    variant_id = await add_variant(inventory_db)
    first = await add_offer(inventory_db, variant_id, on_hand=0, lead=0)
    second = await add_offer(inventory_db, variant_id, on_hand=1, lead=1)
    async with inventory_db() as db:
        variant = await db.get(ProductVariant, variant_id)
        assert await reserve_supplier_stock(db, variant, 1) == second.offer_id
        await db.commit()
    assert (await read_inventory(inventory_db, first)).reserved == 0
    assert (await read_inventory(inventory_db, second)).reserved == 1


@pytest.mark.parametrize("excluded", [
    {"supplier_active": False}, {"active": False}, {"currency": "USD"},
], ids=["inactive-supplier", "inactive-offer", "wrong-currency"])
async def test_ineligible_offers_do_not_reserve_or_enable_legacy_fallback(inventory_db, excluded):
    variant_id = await add_variant(inventory_db)
    first = await add_offer(inventory_db, variant_id, on_hand=100, **excluded)
    async with inventory_db() as db:
        variant = await db.get(ProductVariant, variant_id)
        with pytest.raises(HTTPException) as error:
            await reserve_supplier_stock(db, variant, 1)
        assert error.value.status_code == 409
        await db.rollback()
    second = await add_offer(inventory_db, variant_id, lead=1)
    async with inventory_db() as db:
        variant = await db.get(ProductVariant, variant_id)
        assert await reserve_supplier_stock(db, variant, 1) == second.offer_id
        await db.commit()
    assert (await read_inventory(inventory_db, first)).reserved == 0
    assert (await read_inventory(inventory_db, second)).reserved == 1


async def test_failed_atomic_candidate_update_tries_alternate(inventory_db, monkeypatch):
    """Controlled SQL interleaving, not a second connection or stress test."""
    variant_id = await add_variant(inventory_db)
    first = await add_offer(inventory_db, variant_id, lead=0)
    second = await add_offer(inventory_db, variant_id, lead=1)
    rowcounts = []
    async with inventory_db() as db:
        execute = db.execute

        async def lose_first_candidate(statement, *args, **kwargs):
            is_reserve = getattr(statement, "is_update", False) and statement.table.name == "supplier_inventory"
            if is_reserve and not rowcounts:
                # Exhaust the candidate after SELECT; execute the real guarded
                # UPDATE and inspect its actual rowcount, rather than fake it.
                await execute(update(SupplierInventory).where(
                    SupplierInventory.id == first.inventory_id,
                ).values(reserved=1).execution_options(synchronize_session=False))
            result = await execute(statement, *args, **kwargs)
            if is_reserve:
                rowcounts.append(result.rowcount)
            return result

        monkeypatch.setattr(db, "execute", lose_first_candidate)
        variant = await db.get(ProductVariant, variant_id)
        assert await reserve_supplier_stock(db, variant, 1) == second.offer_id
        await db.commit()
    assert rowcounts == [0, 1]
    for offer in (first, second):
        inventory = await read_inventory(inventory_db, offer)
        assert (inventory.on_hand, inventory.reserved) == (1, 1)


@pytest.mark.parametrize("paid", [False, True], ids=["cancel", "paid"])
async def test_settlement_after_sync_recomputes_projection_and_preserves_observation(inventory_db, paid):
    variant_id = await add_variant(inventory_db, stock=8)
    held = await add_offer(inventory_db, variant_id, on_hand=10, reserved=2)
    alternate = await add_offer(inventory_db, variant_id, on_hand=4, lead=1)
    async with inventory_db() as db:
        snapshot = StockSnapshot.model_validate({
            "offerId": str(held.offer_id), "onHand": 3, "observedAt": OBSERVED.isoformat(),
        }, context={"now": NOW})
        assert await sync_supplier_stock(db, [snapshot], now=NOW) == {"updated": 1, "stale": 0}
        await db.commit()
    before = await read_inventory(inventory_db, held)
    async with inventory_db() as db:
        assert (await db.get(ProductVariant, variant_id)).stock_quantity == 4
        # A later checkout conservatively decrements the MAX projection and
        # places another hold on the fast offer. Settlement must refresh from
        # both offers, while leaving this unrelated reservation untouched.
        await db.execute(update(ProductVariant).where(
            ProductVariant.id == variant_id,
        ).values(stock_quantity=ProductVariant.stock_quantity - 1)
            .execution_options(synchronize_session=False))
        variant = await db.get(ProductVariant, variant_id)
        assert await reserve_supplier_stock(db, variant, 1) == held.offer_id
        await db.commit()
    async with inventory_db() as db:
        assert (await db.get(ProductVariant, variant_id)).stock_quantity == 3
        # Helpers only need these fields; no fabricated paid order or webhook.
        item = OrderItem(variant_id=variant_id, supplier_offer_id=held.offer_id, quantity=2)
        await settle_supplier_stock(db, item, paid=paid)
        if not paid:
            await restore_variant_stock(db, item)
        await db.commit()
    after = await read_inventory(inventory_db, held)
    other = await read_inventory(inventory_db, alternate)
    assert (after.on_hand, after.reserved) == ((1, 1) if paid else (3, 1))
    assert after.last_synced_at == before.last_synced_at
    assert after.last_synced_at.replace(tzinfo=timezone.utc) == OBSERVED
    assert (other.on_hand, other.reserved, other.last_synced_at) == (4, 0, None)
    async with inventory_db() as db:
        projection = (await db.get(ProductVariant, variant_id)).stock_quantity
        assert projection == max(after.on_hand - after.reserved, other.on_hand - other.reserved) == 4
        assert projection <= max(after.on_hand, other.on_hand), "Cancellation must not add stale holds to the synced projection"