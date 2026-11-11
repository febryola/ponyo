"""Public validation snapshots: authoritative catalog data, privacy, and no writes."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select

from app.config import settings
from app.db import get_db
from app.models import (
    Brand, CartItem, Order, Product, ProductImage, ProductVariant, ShoppingCart,
    Supplier, SupplierInventory, SupplierOffer,
)
from app.routers import cart
from app.security import create_session_token
from test_cart import cart_db, customer  # noqa: F401 -- shared isolated database fixtures


@pytest.fixture
async def client(cart_db):
    app = FastAPI()
    app.state.environment = "test"
    app.include_router(cart.router, prefix="/v1")

    async def override_db():
        async with cart_db() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        yield client


async def add_variant(cart_db, *, stock=10, active=True, published=True, currency="JPY", price=1500):
    async with cart_db() as db:
        product = Product(
            slug=uuid4().hex, name="Current toy", price_amount=9999,
            image_url="/images/catalog/ponyo-2.png", image_alt="Current image",
            supplier_name="Public maker", published=published,
        )
        db.add(product)
        await db.flush()
        variant = ProductVariant(
            product_id=product.id, price_amount=price, currency=currency,
            stock_quantity=stock, active=active,
        )
        db.add(variant)
        await db.commit()
        return variant.id, product.id


async def add_offer(cart_db, variant_id, *, on_hand=5, reserved=0, active=True,
                    supplier_active=True, currency="JPY", inventory=True):
    async with cart_db() as db:
        supplier = Supplier(code=uuid4().hex, name="Private supplier", active=supplier_active)
        db.add(supplier)
        await db.flush()
        offer = SupplierOffer(
            supplier_id=supplier.id, variant_id=variant_id, supplier_sku=uuid4().hex,
            cost_amount=123, currency=currency, active=active,
        )
        db.add(offer)
        await db.flush()
        if inventory:
            db.add(SupplierInventory(offer_id=offer.id, on_hand=on_hand, reserved=reserved))
        await db.commit()


def payload(variant_id=None, *, quantity=1, currency="USD", **expectations):
    return {
        "currency": currency,
        "items": [] if variant_id is None else [
            {"variantId": str(variant_id), "quantity": quantity, **expectations},
        ],
    }


async def validate(client, request):
    response = await client.post("/v1/cart/validate", json=request)
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_public_no_csrf_exact_current_price_contract(client, cart_db):
    variant_id, product_id = await add_variant(cart_db)
    data = await validate(client, payload(variant_id, quantity=2, expectedPriceAmount=1, expectedCurrency="jpy"))
    async with cart_db() as db:
        product = await db.get(Product, product_id)
        slug = product.slug
    assert data == {
        "items": [{
            "variantId": str(variant_id), "productId": str(product_id), "quantity": 2,
            "name": "Current toy", "image": "/images/catalog/ponyo-2.png",
            "imageAlt": "Current image", "maker": "Public maker", "slug": slug,
            "priceAmount": 1500, "currency": "JPY", "availableQuantity": 10,
            "availability": "available", "issues": ["price_changed"], "priceChanged": True,
        }],
        "canCheckout": False, "subtotalAmount": 3000, "sourceCurrency": "JPY",
    }
    # Display currency is not an assertion about the variant's source currency.
    unchanged = await validate(client, payload(variant_id, expectedPriceAmount=1500, expectedCurrency="jpy"))
    assert unchanged["canCheckout"] is True
    assert unchanged["items"][0]["issues"] == []
    assert unchanged["items"][0]["priceChanged"] is False
    changed = await validate(client, payload(variant_id, expectedCurrency="usd"))
    assert changed["items"][0]["issues"] == ["currency_changed"]
    assert changed["items"][0]["priceChanged"] is True
    both = await validate(client, payload(variant_id, expectedPriceAmount=0, expectedCurrency="EUR"))
    assert both["items"][0]["issues"] == ["price_changed", "currency_changed"]


async def test_public_brand_and_gallery_media(client, cart_db):
    variant_id, product_id = await add_variant(cart_db)
    async with cart_db() as db:
        brand = Brand(name="Catalog brand", slug=uuid4().hex)
        db.add(brand)
        await db.flush()
        product = await db.get(Product, product_id)
        product.brand_id = brand.id
        db.add_all([
            ProductImage(product_id=product_id, url="/images/catalog/ponyo-3.png", alt="Later", sort_order=2),
            ProductImage(product_id=product_id, url="/images/catalog/ponyo-5.png", alt="First", sort_order=1),
        ])
        await db.commit()
    line = (await validate(client, payload(variant_id)))["items"][0]
    assert (line["maker"], line["image"], line["imageAlt"]) == ("Catalog brand", "/images/catalog/ponyo-5.png", "First")


@pytest.mark.parametrize("kind", ["inactive", "unpublished", "missing"])
async def test_hidden_variants_are_indistinguishable_and_private(client, cart_db, kind):
    variant_id = uuid4() if kind == "missing" else (await add_variant(
        cart_db, active=kind != "inactive", published=kind != "unpublished",
    ))[0]
    data = await validate(client, payload(variant_id, expectedPriceAmount=0, expectedCurrency="USD"))
    assert data == {
        "items": [{
            "variantId": str(variant_id), "productId": None, "quantity": 1,
            "name": "Product unavailable", "image": None, "imageAlt": None,
            "maker": None, "slug": None, "priceAmount": None, "currency": None,
            "availableQuantity": 0, "availability": "unavailable",
            "issues": ["product_unavailable"], "priceChanged": False,
        }],
        "canCheckout": False, "subtotalAmount": 0, "sourceCurrency": None,
    }


async def test_empty_and_one_hundred_inputs(client):
    assert await validate(client, payload()) == {
        "items": [], "canCheckout": False, "subtotalAmount": 0, "sourceCurrency": None,
    }
    request = payload()
    request["items"] = [{"variantId": str(uuid4()), "quantity": 1} for _ in range(100)]
    assert len((await validate(client, request))["items"]) == 100
    request["items"].append({"variantId": str(uuid4()), "quantity": 1})
    assert (await client.post("/v1/cart/validate", json=request)).status_code == 422


@pytest.mark.parametrize("quantity", [0, -1, 100, 1.5, True, "2", None])
async def test_strict_quantity_bounds(client, quantity):
    assert (await client.post("/v1/cart/validate", json=payload(uuid4(), quantity=quantity))).status_code == 422


async def test_quantity_99_and_authoritative_subtotal_for_insufficient_lines(client, cart_db):
    variant_id, _ = await add_variant(cart_db, stock=99)
    data = await validate(client, payload(variant_id, quantity=99))
    assert data["canCheckout"] is True
    assert data["subtotalAmount"] == 148500
    async with cart_db() as db:
        (await db.get(ProductVariant, variant_id)).stock_quantity = 2
        await db.commit()
    data = await validate(client, payload(variant_id, quantity=99))
    assert data["items"][0]["issues"] == ["insufficient_stock"]
    assert data["items"][0]["availability"] == "unavailable"
    assert data["items"][0]["availableQuantity"] == 2
    assert data["canCheckout"] is False
    assert data["subtotalAmount"] == 148500


@pytest.mark.parametrize("price", [-1, 1.5, True, "1500"])
async def test_strict_expected_price(client, price):
    assert (await client.post("/v1/cart/validate", json=payload(uuid4(), expectedPriceAmount=price))).status_code == 422


@pytest.mark.parametrize("field,value", [
    ("currency", "ZZZ"), ("currency", "US"), ("currency", None),
    ("expectedCurrency", "US"), ("expectedCurrency", "USDD"), ("expectedCurrency", 123),
])
async def test_invalid_currencies(client, field, value):
    request = payload(uuid4())
    (request if field == "currency" else request["items"][0])[field] = value
    assert (await client.post("/v1/cart/validate", json=request)).status_code == 422


async def test_duplicate_normalized_uuid_and_invalid_uuid(client):
    variant_id = uuid4()
    request = payload(variant_id)
    request["items"].append({"variantId": variant_id.hex.upper(), "quantity": 2})
    assert (await client.post("/v1/cart/validate", json=request)).status_code == 422
    assert (await client.post("/v1/cart/validate", json=payload("invalid"))).status_code == 422


@pytest.mark.parametrize("level", ["cart", "item"])
@pytest.mark.parametrize("extra", ["priceAmount", "costAmount", "customerId", "supplierOfferId"])
async def test_extra_fields_forbidden(client, level, extra):
    request = payload(uuid4())
    (request if level == "cart" else request["items"][0])[extra] = "untrusted"
    assert (await client.post("/v1/cart/validate", json=request)).status_code == 422


@pytest.mark.parametrize("offer_options", [
    {"on_hand": 0}, {"on_hand": 5, "reserved": 5}, {"active": False},
    {"supplier_active": False}, {"currency": "USD"}, {"inventory": False},
])
async def test_supplier_zero_and_ineligible_offers_do_not_fall_back(client, cart_db, offer_options):
    variant_id, _ = await add_variant(cart_db)
    await add_offer(cart_db, variant_id, **offer_options)
    data = await validate(client, payload(variant_id))
    line = data["items"][0]
    assert line["availableQuantity"] == 0
    assert line["availability"] == "unavailable"
    assert line["issues"] == ["insufficient_stock"]
    assert data["canCheckout"] is False


async def test_supplier_stock_uses_max_not_sum_and_respects_variant_cap(client, cart_db):
    variant_id, _ = await add_variant(cart_db, stock=10)
    await add_offer(cart_db, variant_id, on_hand=7, reserved=3)
    await add_offer(cart_db, variant_id, on_hand=6, reserved=1)
    data = await validate(client, payload(variant_id, quantity=6))
    assert data["items"][0]["availableQuantity"] == 5
    assert data["canCheckout"] is False
    assert (await validate(client, payload(variant_id, quantity=5)))["canCheckout"] is True
    async with cart_db() as db:
        (await db.get(ProductVariant, variant_id)).stock_quantity = 3
        await db.commit()
    assert (await validate(client, payload(variant_id)))["items"][0]["availableQuantity"] == 3


async def test_mixed_currency_marks_all_lines_and_never_sums_currencies(client, cart_db):
    first, _ = await add_variant(cart_db)
    second, _ = await add_variant(cart_db, currency="USD", price=1200)
    missing = uuid4()
    request = payload(first)
    request["items"] += [{"variantId": str(value), "quantity": 1} for value in (second, missing)]
    data = await validate(client, request)
    assert [line["variantId"] for line in data["items"]] == [str(first), str(second), str(missing)]
    assert all("mixed_currency" in line["issues"] for line in data["items"])
    assert [line["currency"] for line in data["items"]] == ["JPY", "USD", None]
    assert data["canCheckout"] is False
    assert data["subtotalAmount"] == 0
    assert data["sourceCurrency"] is None


async def test_distinct_suppliers_are_valid_and_validation_never_writes(client, cart_db, customer):
    first, _ = await add_variant(cart_db)
    second, _ = await add_variant(cart_db)
    await add_offer(cart_db, first)
    await add_offer(cart_db, second)
    client.cookies.set(settings.session_cookie_name, create_session_token(customer))
    client.cookies.set(settings.csrf_cookie_name, "validation-csrf")
    client.headers["X-CSRF-Token"] = "validation-csrf"
    assert (await client.put("/v1/cart", json=payload(first, quantity=2))).status_code == 200
    original = (await client.get("/v1/cart")).json()
    tables = [ShoppingCart, CartItem, ProductVariant, SupplierOffer, SupplierInventory, Order]

    async def snapshot():
        async with cart_db() as db:
            return [(await db.execute(select(model.__table__))).all() for model in tables]

    before = await snapshot()
    statements = []
    engine = cart_db.kw["bind"].sync_engine

    def record_sql(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement.strip().split()[0].upper())

    event.listen(engine, "before_cursor_execute", record_sql)
    try:
        # No CSRF is needed even when an authenticated session cookie is present.
        del client.headers["X-CSRF-Token"]
        request = payload(second)
        request["items"].append({"variantId": str(first), "quantity": 3})
        assert (await validate(client, request))["canCheckout"] is True
    finally:
        event.remove(engine, "before_cursor_execute", record_sql)
    assert statements and set(statements) <= {"SELECT", "BEGIN"}
    assert await snapshot() == before
    assert (await client.get("/v1/cart")).json() == original


async def test_actual_rate_limit_bucket_and_boundary(cart_db):
    app = FastAPI()
    app.state.environment = "test"
    app.state.redis = AsyncMock()
    app.state.redis.incr.side_effect = range(1, 62)
    app.include_router(cart.router, prefix="/v1")

    async def override_db():
        async with cart_db() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        for _ in range(60):
            await validate(client, payload())
        limited = await client.post("/v1/cart/validate", json=payload())
        assert limited.status_code == 429
        assert limited.headers["Retry-After"] == "60"
    app.state.redis.incr.assert_awaited_with("ponyo:rate:cart-validate:127.0.0.1")
    app.state.redis.expire.assert_awaited_once_with("ponyo:rate:cart-validate:127.0.0.1", 60)