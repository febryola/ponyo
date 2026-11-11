"""Public product discovery regressions against isolated, in-memory SQLite."""

import socket
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import (
    Product, ProductImage, ProductTranslation,
    ProductVariant, Supplier, SupplierInventory, SupplierOffer,
)
from app.storefront_data import link_demo_catalog
from app.translations import source_hash
from test_api import add_product, test_client as test_client


pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def isolated_discovery(monkeypatch):
    monkeypatch.setattr(settings, "environment", "test")
    monkeypatch.setattr(settings, "translation_provider", "disabled")
    blocked = Mock(side_effect=AssertionError("Discovery tests must not use external services"))
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr("app.translations._translate_with_aws", blocked)


async def get_data(client, path="/v1/products", **params):
    response = await client.get(path, params=params)
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.fixture
async def discovery_catalog(test_client):
    client, sessions = test_client
    bunny, bunny_variant = await add_product(sessions, slug="moon-bunny", price=1800)
    bear, bear_variant = await add_product(sessions, slug="sun-bear", price=2700)
    async with sessions() as db:
        first = await db.get(Product, bunny)
        first.name = "Moon Bunny"
        first.description = "Velvet moonbeam companion"
        first.supplier_name = "Lunar Makers"
        first.category_name = "Cuddly Bunnies"
        first.sku = "PNY-MOON-EXCLUSIVE"
        first.size_tier = "small"
        second = await db.get(Product, bear)
        second.name = "Sun Bear"
        second.supplier_name = "Solar Makers"
        second.category_name = "Friendly Bears"
        second.size_tier = "large"
        await db.flush()
        await link_demo_catalog(db)
        await db.commit()
        category_id, brand_id = first.category_id, first.brand_id
    return client, sessions, bunny, bunny_variant, bear, bear_variant, category_id, brand_id


@pytest.mark.parametrize("params", [
    {"brand": "lunar-makers"}, {"brand": " LUNAR MAKERS "},
    {"category": "cuddly-bunnies"}, {"category": " CUDDLY BUNNIES "},
    {"q": "LUNAR MAKERS"}, {"q": "PNY-MOON-EXCLUSIVE"},
    {"q": "moonbeam"}, {"q": " Moon Bunny "},
    {"size": " SMALL "}, {"min_price": 1800, "max_price": 1800},
])
async def test_filters_and_source_search(discovery_catalog, params):
    client, _, bunny, *_ = discovery_catalog
    rows = await get_data(client, **params)
    assert [row["id"] for row in rows] == [str(bunny)]


async def test_taxonomy_ids_and_combined_filters(discovery_catalog):
    client, _, bunny, _, bear, _, category_id, brand_id = discovery_catalog
    for params in [
        {"category_id": str(category_id)}, {"brand_id": str(brand_id)},
        {"category_id": str(category_id), "brand_id": str(brand_id),
         "brand": "lunar-makers", "category": "cuddly-bunnies", "availability": "available"},
    ]:
        assert [row["id"] for row in await get_data(client, **params)] == [str(bunny)]
    # A missing UUID is a valid filter, not an instruction to ignore it.
    for params in [
        {"category_id": str(uuid4())}, {"brand_id": str(uuid4())},
        {"category": "not-a-category"}, {"brand": "not-a-brand"},
        {"category_id": str(category_id), "brand": "solar-makers"},
    ]:
        response = await client.get("/v1/products", params=params)
        assert response.status_code == 200, response.text
        assert response.json()["data"] == []
        assert response.json()["total"] == 0
    assert {row["id"] for row in await get_data(client)} == {str(bunny), str(bear)}


@pytest.mark.parametrize("sort", [
    "title-ascending", "title-descending", "created-ascending", "newest",
    "created-descending", "best-selling", "available-first", "price-ascending",
    "price-descending", "unknown-sort",
])
async def test_sorting_and_stable_uuid_ties_across_pages(test_client, sort):
    client, sessions = test_client
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    records = []
    for index, (name, day, stock, price) in enumerate([
        ("Zulu", 0, 0, 2000), ("Alpha", 2, 4, 1000),
        ("Alpha", 2, 4, 1000), ("Beta", 1, 4, 3000),
    ]):
        product_id, _ = await add_product(sessions, slug=f"sort-{index}", stock=stock, price=price)
        async with sessions() as db:
            product = await db.get(Product, product_id)
            product.name = name
            product.created_at = base + timedelta(days=day)
            await db.commit()
        records.append((str(product_id), name, day, stock, price))
    keys = {
        "title-ascending": lambda row: (row[1], row[0]),
        "title-descending": lambda row: (tuple(-ord(c) for c in row[1]), row[0]),
        "created-ascending": lambda row: (row[2], row[0]),
        "newest": lambda row: (-row[2], row[0]),
        "created-descending": lambda row: (-row[2], row[0]),
        "best-selling": lambda row: (-row[2], row[0]),
        "available-first": lambda row: (-bool(row[3]), row[0]),
        "price-ascending": lambda row: (not bool(row[3]), row[4] if row[3] else 0, row[0]),
        "price-descending": lambda row: (not bool(row[3]), -row[4] if row[3] else 0, row[0]),
    }
    expected = [row[0] for row in sorted(records, key=keys.get(sort, keys["title-ascending"]))]
    pages = []
    for page in range(1, 5):
        response = await client.get("/v1/products", params={"sort": sort, "page": page, "limit": 1})
        assert response.status_code == 200, response.text
        payload = response.json()
        assert (payload["page"], payload["limit"], payload["total"]) == (page, 1, 4)
        pages.extend(row["id"] for row in payload["data"])
    assert pages == expected
    assert [row["id"] for row in await get_data(client, sort=sort)] == expected
    beyond = await client.get("/v1/products", params={"sort": sort, "page": 999, "limit": 1})
    assert beyond.json() == {"data": [], "page": 999, "limit": 1, "total": 4}


async def test_empty_catalog_pagination(test_client):
    client, _ = test_client
    for params, page, limit in [({}, 1, 24), ({"page": 999, "limit": 100}, 999, 100)]:
        response = await client.get("/v1/products", params=params)
        assert response.status_code == 200
        assert response.json() == {"data": [], "page": page, "limit": limit, "total": 0}


@pytest.mark.parametrize("params", [
    {"limit": 0}, {"limit": -1}, {"limit": 101}, {"limit": "bad"},
    {"page": 0}, {"page": -1}, {"page": "bad"},
    {"min_price": -1}, {"max_price": -1}, {"min_price": "bad"},
    {"min_price": 2000, "max_price": 1000},
    {"category_id": "bad"}, {"brand_id": "bad"},
    {"availability": "maybe"}, {"q": "x" * 121},
])
async def test_invalid_discovery_parameters_return_422(test_client, params):
    client, _ = test_client
    assert (await client.get("/v1/products", params=params)).status_code == 422


async def add_offer(db, variant_id, *, on_hand=10, reserved=0, supplier_active=True,
                    active=True, currency="JPY", inventory=True):
    supplier = Supplier(code=f"PRIVATE-{uuid4().hex}", name="Confidential wholesale", active=supplier_active)
    db.add(supplier)
    await db.flush()
    offer = SupplierOffer(
        supplier_id=supplier.id, variant_id=variant_id, supplier_sku=f"SECRET-{uuid4().hex}",
        cost_amount=987654, currency=currency, active=active,
    )
    db.add(offer)
    await db.flush()
    if inventory:
        db.add(SupplierInventory(offer_id=offer.id, on_hand=on_hand, reserved=reserved))


@pytest.mark.parametrize("stock,offers,quantity", [
    (7, [], 7),  # Legacy variants without offers retain their stock fallback.
    (0, [], 0),
    (4, [{"on_hand": 20}], 4),  # Variant stock caps supplier stock.
    (10, [{"on_hand": 7, "reserved": 5}], 2),
    (10, [{"on_hand": 7, "reserved": 7}], 0),
    (10, [{"supplier_active": False}], 0),
    (10, [{"active": False}], 0),
    (10, [{"currency": "USD"}], 0),
    (10, [{"inventory": False}], 0),
    (0, [{"on_hand": 20}], 0),
    (10, [{"on_hand": 3}, {"on_hand": 4}], 4),  # One offer must fulfill: max, never sum.
    (10, [{"on_hand": 9, "reserved": 7}, {"on_hand": 8, "reserved": 3}], 5),
    (10, [{"supplier_active": False, "on_hand": 100}, {"on_hand": 2}], 2),
    (10, [{"active": False, "on_hand": 100}, {"on_hand": 2}], 2),
    (10, [{"currency": "USD", "on_hand": 100}, {"on_hand": 2}], 2),
])
async def test_supplier_availability_agrees_across_all_public_views(test_client, stock, offers, quantity):
    client, sessions = test_client
    product_id, variant_id = await add_product(sessions, stock=stock)
    async with sessions() as db:
        for offer in offers:
            await add_offer(db, variant_id, **offer)
        await db.commit()
    expected = "available" if quantity else "unavailable"
    for identifier in [str(product_id), "test-bunny"]:
        root = f"/v1/products/{identifier}"
        detail = await get_data(client, root)
        availability = await get_data(client, f"{root}/availability")
        variants = await get_data(client, f"{root}/variants")
        variant = await get_data(client, f"{root}/variants/{variant_id}")
        assert detail["availability"] == availability["availability"] == expected
        assert availability["productId"] == str(product_id)
        assert availability["variants"] == [{
            "variantId": str(variant_id), "availability": expected, "availableQuantity": quantity,
        }]
        assert detail["variants"] == variants == [variant]
        assert variant["availability"] == expected
    for filter_value in ["available", "unavailable"]:
        rows = await get_data(client, availability=filter_value)
        assert [row["id"] for row in rows] == ([str(product_id)] if filter_value == expected else [])
    rows = await get_data(client)
    assert rows[0]["availability"] == expected
    # Available-first must use the same supplier-aware predicate, not raw variant stock.
    other_id, _ = await add_product(sessions, slug="legacy-in-stock", stock=1)
    ordered = await get_data(client, sort="available-first")
    expected_ids = sorted([str(product_id), str(other_id)]) if quantity else [str(other_id), str(product_id)]
    assert [row["id"] for row in ordered] == expected_ids


async def test_inactive_variants_are_hidden_and_other_products_are_scoped(test_client):
    client, sessions = test_client
    product_id, inactive_id = await add_product(sessions, stock=100)
    other_id, other_variant = await add_product(sessions, slug="other-product")
    async with sessions() as db:
        variant = await db.get(ProductVariant, inactive_id)
        variant.active = False
        await add_offer(db, inactive_id, on_hand=100)
        await db.commit()
    for identifier in [str(product_id), "test-bunny"]:
        root = f"/v1/products/{identifier}"
        detail = await get_data(client, root)
        assert detail["variants"] == []
        assert detail["variantId"] is None
        assert detail["availability"] == "unavailable"
        assert await get_data(client, f"{root}/variants") == []
        availability = await get_data(client, f"{root}/availability")
        assert availability["availability"] == "unavailable"
        assert availability["variants"] == []
        for hidden_id in [inactive_id, other_variant, uuid4()]:
            assert (await client.get(f"{root}/variants/{hidden_id}")).status_code == 404
    assert [row["id"] for row in await get_data(client, availability="available")] == [str(other_id)]
    assert [row["id"] for row in await get_data(client, availability="unavailable")] == [str(product_id)]


async def test_unpublished_and_unknown_products_are_404_everywhere(test_client):
    client, sessions = test_client
    product_id, variant_id = await add_product(sessions)
    async with sessions() as db:
        product = await db.get(Product, product_id)
        product.published = False
        await db.commit()
    assert await get_data(client) == []
    assert await get_data(client, q="test-bunny") == []
    for identifier in [str(product_id), "test-bunny", str(uuid4()), "missing-product"]:
        for suffix in ["", "/variants", f"/variants/{variant_id}", "/images", "/availability"]:
            response = await client.get(f"/v1/products/{identifier}{suffix}")
            assert response.status_code == 404, (identifier, suffix, response.text)
            assert response.json()["error"]["code"] == "not_found"
            assert response.json()["error"]["request_id"] == response.headers["X-Request-ID"]


async def test_public_views_never_expose_supplier_costs_or_identifiers(discovery_catalog):
    client, sessions, product_id, variant_id, *_ = discovery_catalog
    async with sessions() as db:
        await add_offer(db, variant_id)
        await db.commit()
        supplier_ids = [str(value) for value in (await db.scalars(select(Supplier.id))).all()]
        offer_ids = [str(value) for value in (await db.scalars(select(SupplierOffer.id))).all()]
    variant_fields = {"id", "sku", "title", "priceAmount", "currency", "compareAtAmount", "availability", "options"}
    for path in ["/v1/products", f"/v1/products/{product_id}",
                 f"/v1/products/{product_id}/variants", f"/v1/products/{product_id}/variants/{variant_id}",
                 f"/v1/products/{product_id}/availability", f"/v1/products/{product_id}/images"]:
        response = await client.get(path)
        assert response.status_code == 200, response.text
        for private in ["cost_amount", "costAmount", "supplier_sku", "supplierSku", "supplierId", "offerId",
                        "987654", "Confidential wholesale", "SECRET-", *supplier_ids, *offer_ids]:
            assert private not in response.text
    variants = await get_data(client, f"/v1/products/{product_id}/variants")
    assert variants and all(set(variant) == variant_fields for variant in variants)


async def test_images_are_position_ordered_and_vendor_urls_are_safe(test_client):
    client, sessions = test_client
    product_id, _ = await add_product(sessions)
    image_ids = [uuid4(), uuid4(), uuid4()]
    async with sessions() as db:
        for image_id, position, url, alt in [
            (image_ids[2], 8, "https://vendor.invalid/private.jpg", "Fallback"),
            (image_ids[0], 1, "https://vendor.invalid/maker-bunny.jpg", "Bunny first"),
            (image_ids[1], 4, "/images/catalog/maker-bear.jpg", "Bear second"),
        ]:
            db.add(ProductImage(id=image_id, product_id=product_id, sort_order=position, url=url, alt=alt))
        await db.commit()
    for identifier in [str(product_id), "test-bunny"]:
        images = await get_data(client, f"/v1/products/{identifier}/images")
        assert images == [
            {"id": str(image_ids[0]), "url": "/images/catalog/maker-bunny.jpg", "alt": "Bunny first", "position": 1},
            {"id": str(image_ids[1]), "url": "/images/catalog/maker-bear.jpg", "alt": "Bear second", "position": 4},
            {"id": str(image_ids[2]), "url": "/images/catalog/ponyo-2.png", "alt": "Fallback", "position": 8},
        ]
        detail = await get_data(client, f"/v1/products/{identifier}")
        assert detail["image"] == images[0]["url"]
        assert detail["imageAlt"] == images[0]["alt"]
        assert detail["images"] == [{"url": image["url"], "alt": image["alt"]} for image in images]
        assert detail["galleryImages"] == [{"src": image["url"], "alt": image["alt"]} for image in images]


async def test_images_without_rows_use_safe_legacy_fallback(test_client):
    client, sessions = test_client
    product_id, _ = await add_product(sessions)
    assert await get_data(client, f"/v1/products/{product_id}/images") == [
        {"id": None, "url": "/images/catalog/ponyo-2.png", "alt": "Bunny", "position": 0},
    ]


async def test_cached_japanese_search_and_disabled_provider_fallback(discovery_catalog):
    client, sessions, product_id, *_ = discovery_catalog
    async with sessions() as db:
        product = await db.get(Product, product_id)
        db.add(ProductTranslation(
            product_id=product_id, locale="ja", source_hash=source_hash(product),
            name="月のうさぎ", description="ふわふわの月光のおともだち", provider="aws_translate",
        ))
        # Another cached locale must not match a Japanese query.
        db.add(ProductTranslation(
            product_id=product_id, locale="fr", source_hash=source_hash(product),
            name="Lapin lunaire", description="Compagnon doux", provider="aws_translate",
        ))
        await db.commit()
    for query in ["月のうさぎ", "月光", "MOON BUNNY", "PNY-MOON-EXCLUSIVE", "Lunar Makers"]:
        rows = await get_data(client, q=query, locale="ja")
        assert [row["id"] for row in rows] == [str(product_id)]
        assert rows[0]["name"] == "月のうさぎ"
        assert rows[0]["description"] == "ふわふわの月光のおともだち"
    for locale in ["en", "xx"]:
        assert await get_data(client, q="月のうさぎ", locale=locale) == []
        rows = await get_data(client, q="Moon Bunny", locale=locale)
        assert rows[0]["name"] == "Moon Bunny"
        assert rows[0]["description"] == "Velvet moonbeam companion"
        detail = await get_data(client, f"/v1/products/{product_id}", locale=locale)
        assert detail["name"] == "Moon Bunny"
    assert await get_data(client, q="Lapin lunaire", locale="ja") == []
    detail = await get_data(client, f"/v1/products/{product_id}", locale="ja")
    assert detail["name"] == "月のうさぎ"
    untranslated = await get_data(client, "/v1/products/sun-bear", locale="ja")
    assert untranslated["name"] == "Sun Bear"