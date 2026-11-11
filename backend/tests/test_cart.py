"""Cart-only app and database: no application lifespan, email, or network calls."""

from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import Base, get_db
from app.models import (
    CartItem, Customer, Product, ProductVariant, ShoppingCart,
    Supplier, SupplierInventory, SupplierOffer,
)
from app.routers import cart
from app.security import create_session_token


@pytest.fixture
async def cart_db(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'cart.sqlite').as_posix()}")

    @event.listens_for(engine.sync_engine, "connect")
    def configure_sqlite(connection, _record):
        connection.isolation_level = None
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    @event.listens_for(engine.sync_engine, "begin")
    def begin_sqlite(connection):
        connection.exec_driver_sql("BEGIN")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.fixture
async def customer(cart_db):
    async with cart_db() as db:
        customer = Customer(email="cart@example.test", password_hash="unused", email_verified=True)
        db.add(customer)
        await db.commit()
        return customer.id


@pytest.fixture
async def client(cart_db, monkeypatch):
    monkeypatch.setattr(settings, "cookie_secure", False)
    app = FastAPI()
    app.include_router(cart.router, prefix="/v1")

    async def override_db():
        async with cart_db() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        client.cookies.set(settings.csrf_cookie_name, "cart-test-csrf")
        client.headers["X-CSRF-Token"] = "cart-test-csrf"
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
async def signed_in(client, customer):
    client.cookies.set(settings.session_cookie_name, create_session_token(customer))
    return client


async def add_variant(cart_db, *, stock=10, active=True, published=True):
    async with cart_db() as db:
        product = Product(
            slug=uuid4().hex, name="Cart toy", price_amount=1500,
            image_url="/images/toy.png", published=published,
        )
        db.add(product)
        await db.flush()
        variant = ProductVariant(
            product_id=product.id, price_amount=1500, stock_quantity=stock, active=active,
        )
        db.add(variant)
        await db.commit()
        return variant.id


def payload(variant_id=None, *, quantity=1, currency="JPY"):
    return {
        "currency": currency,
        "items": [] if variant_id is None else [{"variantId": str(variant_id), "quantity": quantity}],
    }


@pytest.mark.parametrize("method", ["get", "put"])
async def test_authentication_required(client, method):
    response = await client.request(method, "/v1/cart", **({"json": payload()} if method == "put" else {}))
    assert response.status_code == 401


@pytest.mark.parametrize("method", ["get", "put"])
async def test_pending_customer_forbidden(client, cart_db, method):
    async with cart_db() as db:
        pending = Customer(email="pending@example.test", password_hash="unused", email_verified=False)
        db.add(pending)
        await db.commit()
        client.cookies.set(settings.session_cookie_name, create_session_token(pending.id))
    response = await client.request(method, "/v1/cart", **({"json": payload()} if method == "put" else {}))
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "email_verification_required"


@pytest.mark.parametrize("csrf", ["missing_header", "missing_cookie", "mismatch"])
async def test_put_requires_csrf(signed_in, csrf):
    if csrf == "missing_header":
        del signed_in.headers["X-CSRF-Token"]
    elif csrf == "missing_cookie":
        signed_in.cookies.delete(settings.csrf_cookie_name)
    else:
        signed_in.headers["X-CSRF-Token"] = "wrong-token"
    assert (await signed_in.put("/v1/cart", json=payload())).status_code == 403


async def test_empty_get_does_not_create_cart(signed_in, cart_db):
    response = await signed_in.get("/v1/cart")
    assert response.status_code == 200
    assert response.json() == {"data": {"id": None, "currency": "JPY", "items": []}}
    async with cart_db() as db:
        assert await db.scalar(select(func.count()).select_from(ShoppingCart)) == 0


async def test_replace_get_and_clear_persist_without_reserving_stock(signed_in, cart_db, customer):
    first = await add_variant(cart_db)
    second = await add_variant(cart_db)
    response = await signed_in.put("/v1/cart", json=payload(first, quantity=2, currency="usd"))
    assert response.status_code == 200
    original = response.json()["data"]
    UUID(original["id"])
    assert original["currency"] == "USD"
    async with cart_db() as db:
        first_product = str((await db.get(ProductVariant, first)).product_id)
        second_product = str((await db.get(ProductVariant, second)).product_id)
    assert original["items"] == [{"variantId": str(first), "quantity": 2, "productId": first_product}]
    assert (await signed_in.get("/v1/cart")).json()["data"] == original

    # Keep one variant while replacing the other to exercise the unique item key.
    request = payload(first, quantity=3, currency="EUR")
    request["items"].append({"variantId": str(second), "quantity": 4})
    assert (await signed_in.put("/v1/cart", json=request)).status_code == 200
    replacement = await signed_in.put("/v1/cart", json=payload(second, quantity=5, currency="GBP"))
    expected = {"id": original["id"], "currency": "GBP", "items": [{"variantId": str(second), "quantity": 5, "productId": second_product}]}
    assert replacement.json()["data"] == expected
    assert (await signed_in.get("/v1/cart")).json()["data"] == expected
    async with cart_db() as db:
        stored = await db.scalar(select(ShoppingCart).where(ShoppingCart.customer_id == customer))
        assert stored.guest_token_hash is None
        assert await db.scalar(select(func.count()).select_from(CartItem)) == 1
        assert (await db.get(ProductVariant, first)).stock_quantity == 10
        assert (await db.get(ProductVariant, second)).stock_quantity == 10
    cleared = await signed_in.put("/v1/cart", json=payload(currency="CAD"))
    assert cleared.json()["data"] == {"id": original["id"], "currency": "CAD", "items": []}
    assert (await signed_in.get("/v1/cart")).json() == cleared.json()


async def test_other_customer_and_guest_cart_are_isolated(signed_in, cart_db, customer):
    variant_id = await add_variant(cart_db)
    own = (await signed_in.put("/v1/cart", json=payload(variant_id))).json()
    async with cart_db() as db:
        other = Customer(email="other@example.test", password_hash="unused", email_verified=True)
        guest = ShoppingCart(guest_token_hash="a" * 64, currency="EUR")
        db.add_all([other, guest])
        await db.flush()
        db.add(CartItem(cart_id=guest.id, variant_id=variant_id, quantity=7))
        await db.commit()
        other_id, guest_id = other.id, guest.id
    signed_in.cookies.set(settings.session_cookie_name, create_session_token(other_id))
    assert (await signed_in.get("/v1/cart")).json()["data"]["id"] is None
    other_cart = await signed_in.put("/v1/cart", json=payload(variant_id, quantity=3))
    assert other_cart.status_code == 200
    assert other_cart.json()["data"]["id"] != own["data"]["id"]
    signed_in.cookies.set(settings.session_cookie_name, create_session_token(customer))
    assert (await signed_in.get("/v1/cart")).json() == own
    async with cart_db() as db:
        assert await db.scalar(select(CartItem.quantity).where(CartItem.cart_id == guest_id)) == 7


@pytest.mark.parametrize("quantity", [0, -1, 100, 1.5, True, "2", None])
async def test_invalid_quantity(signed_in, quantity):
    assert (await signed_in.put("/v1/cart", json=payload(uuid4(), quantity=quantity))).status_code == 422


@pytest.mark.parametrize("currency", ["ZZZ", "US", "USDD", "", None, 123])
async def test_invalid_currency(signed_in, currency):
    assert (await signed_in.put("/v1/cart", json=payload(currency=currency))).status_code == 422


@pytest.mark.parametrize("currency", ["JPY", "USD", "EUR", "GBP", "AUD", "CAD", "IDR"])
async def test_supported_currency(signed_in, currency):
    response = await signed_in.put("/v1/cart", json=payload(currency=currency.lower()))
    assert response.status_code == 200
    assert response.json()["data"]["currency"] == currency


async def test_duplicate_uuid_and_item_limit(signed_in):
    variant_id = uuid4()
    request = payload(variant_id)
    request["items"].append({"variantId": variant_id.hex.upper(), "quantity": 2})
    assert (await signed_in.put("/v1/cart", json=request)).status_code == 422
    request["items"] = [{"variantId": str(uuid4()), "quantity": 1} for _ in range(101)]
    assert (await signed_in.put("/v1/cart", json=request)).status_code == 422
    assert (await signed_in.put("/v1/cart", json=payload("not-a-uuid"))).status_code == 422


@pytest.mark.parametrize("extra", ["price", "unitPrice", "customerId", "cartId", "guest_token_hash"])
@pytest.mark.parametrize("level", ["cart", "item"])
async def test_extra_fields_forbidden(signed_in, extra, level):
    request = payload(uuid4())
    target = request if level == "cart" else request["items"][0]
    target[extra] = "untrusted"
    assert (await signed_in.put("/v1/cart", json=request)).status_code == 422


@pytest.mark.parametrize("kind,status", [("unknown", 422), ("inactive", 422), ("unpublished", 422), ("empty", 409), ("insufficient", 409)])
async def test_invalid_stock_preserves_existing_cart(signed_in, cart_db, kind, status):
    valid_id = await add_variant(cart_db)
    original = (await signed_in.put("/v1/cart", json=payload(valid_id))).json()
    invalid_id = uuid4() if kind == "unknown" else await add_variant(
        cart_db, stock=0 if kind == "empty" else 1,
        active=kind != "inactive", published=kind != "unpublished",
    )
    request = payload(valid_id, quantity=2, currency="USD")
    request["items"].append({"variantId": str(invalid_id), "quantity": 2})
    assert (await signed_in.put("/v1/cart", json=request)).status_code == status
    assert (await signed_in.get("/v1/cart")).json() == original


async def test_quantity_upper_boundary(signed_in, cart_db):
    variant_id = await add_variant(cart_db, stock=99)
    assert (await signed_in.put("/v1/cart", json=payload(variant_id, quantity=99))).status_code == 200


async def test_supplier_availability_is_checked_but_not_reserved(signed_in, cart_db):
    variant_id = await add_variant(cart_db)
    async with cart_db() as db:
        supplier = Supplier(code="cart-test", name="Cart supplier")
        db.add(supplier)
        await db.flush()
        offer = SupplierOffer(
            supplier_id=supplier.id, variant_id=variant_id, supplier_sku="toy", cost_amount=500,
            currency="JPY",
        )
        db.add(offer)
        await db.flush()
        inventory = SupplierInventory(offer_id=offer.id, on_hand=5, reserved=3)
        db.add(inventory)
        await db.commit()
        inventory_id = inventory.id
    assert (await signed_in.put("/v1/cart", json=payload(variant_id, quantity=2))).status_code == 200
    original = (await signed_in.get("/v1/cart")).json()
    assert (await signed_in.put("/v1/cart", json=payload(variant_id, quantity=3))).status_code == 409
    assert (await signed_in.get("/v1/cart")).json() == original
    async with cart_db() as db:
        inventory = await db.get(SupplierInventory, inventory_id)
        assert (inventory.on_hand, inventory.reserved) == (5, 3)
        assert (await db.get(ProductVariant, variant_id)).stock_quantity == 10


async def test_unique_cart_insert_race_reselects_winner(signed_in, cart_db, monkeypatch):
    variant_id = await add_variant(cart_db)
    original = (await signed_in.put("/v1/cart", json=payload(variant_id))).json()
    real_scalar = AsyncSession.scalar
    missed = False

    async def miss_first_cart_lookup(db, statement, *args, **kwargs):
        nonlocal missed
        if not missed and statement.column_descriptions[0].get("entity") is ShoppingCart:
            missed = True
            return None  # Simulate another request inserting after our initial miss.
        return await real_scalar(db, statement, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, "scalar", miss_first_cart_lookup)
    response = await signed_in.put("/v1/cart", json=payload(variant_id, quantity=4, currency="USD"))
    assert missed
    assert response.status_code == 200
    assert response.json()["data"]["id"] == original["data"]["id"]
    async with cart_db() as db:
        product_id = str((await db.get(ProductVariant, variant_id)).product_id)
    assert response.json()["data"]["items"] == [{"variantId": str(variant_id), "quantity": 4, "productId": product_id}]
    async with cart_db() as db:
        assert await db.scalar(select(func.count()).select_from(ShoppingCart)) == 1


async def test_replace_rolls_back_after_delete_on_failure(signed_in, cart_db, monkeypatch):
    variant_id = await add_variant(cart_db)
    original = (await signed_in.put("/v1/cart", json=payload(variant_id))).json()
    with monkeypatch.context() as patch:
        patch.setattr(cart, "_cart_data", AsyncMock(side_effect=RuntimeError("injected read failure")))
        with pytest.raises(RuntimeError, match="injected read failure"):
            await signed_in.put("/v1/cart", json=payload(variant_id, quantity=5, currency="USD"))
    assert (await signed_in.get("/v1/cart")).json() == original


async def test_reads_fresh_items_when_collection_was_loaded(cart_db, customer):
    first = await add_variant(cart_db)
    second = await add_variant(cart_db)
    async with cart_db() as db:
        customer_row = await db.get(Customer, customer)
        await cart.update_cart(cart.CartUpdate(**payload(first)), customer_row, db)
        loaded = await db.scalar(select(ShoppingCart).options(selectinload(ShoppingCart.items)))
        assert loaded.items[0].variant_id == first
        response = await cart.update_cart(cart.CartUpdate(**payload(second)), customer_row, db)
        product_id = str((await db.get(ProductVariant, second)).product_id)
        assert response["data"]["items"] == [{"variantId": str(second), "quantity": 1, "productId": product_id}]
        assert (await cart.get_cart(customer_row, db)) == response