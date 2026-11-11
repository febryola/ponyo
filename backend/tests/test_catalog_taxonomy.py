"""Isolated public taxonomy contract tests: no main-app startup or network services."""

from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.models import Brand, Product, ProductCategory
from app.routers.catalog import router
from app.storefront_data import link_demo_catalog


@pytest.fixture
async def taxonomy_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with sessions() as db:
            yield db

    app = FastAPI()
    app.include_router(router, prefix="/v1")
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
            yield client, sessions, engine
    finally:
        await engine.dispose()


@pytest.fixture
async def taxonomy_data(taxonomy_client):
    _, sessions, _ = taxonomy_client
    categories = {
        "first": ProductCategory(id=UUID(int=1), slug="cuddly-bunnies", name="Bunnies"),
        "second": ProductCategory(id=UUID(int=2), slug="bunny-friends", name="Bunnies", parent_id=UUID(int=1)),
        "third": ProductCategory(id=UUID(int=3), slug="clouds", name="Clouds", parent_id=UUID(int=4)),
        "inactive": ProductCategory(id=UUID(int=4), slug="inactive", name="Inactive", active=False),
        "draft": ProductCategory(id=UUID(int=5), slug="draft-only", name="Draft only"),
        "empty": ProductCategory(id=UUID(int=6), slug="empty", name="Empty"),
    }
    brands = {
        "first": Brand(id=UUID(int=11), slug="cuddly-makers", name="Makers", is_demo=True),
        "second": Brand(id=UUID(int=12), slug="more-makers", name="Makers"),
        "third": Brand(id=UUID(int=13), slug="cloud-works", name="Works"),
        "draft": Brand(id=UUID(int=14), slug="draft-only", name="Draft only"),
        "empty": Brand(id=UUID(int=15), slug="empty", name="Empty"),
    }
    async with sessions() as db:
        db.add_all([*categories.values(), *brands.values()])
        await db.flush()
        for index, (category, brand, published) in enumerate([
            ("first", "first", True), ("first", "first", True), ("first", "first", False),
            ("second", "second", True), ("third", "third", True),
            ("inactive", "third", True), ("draft", "draft", False),
        ]):
            db.add(Product(
                slug=f"taxonomy-product-{index}", name=f"Product {index}",
                price_amount=1500, image_url="/images/test.png", published=published,
                category_id=categories[category].id, brand_id=brands[brand].id,
                supplier_name="Private supplier label",
            ))
        await db.commit()
    return categories, brands


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["categories", "brands"])
async def test_list_visibility_counts_order_and_privacy(taxonomy_client, taxonomy_data, resource):
    client, _, _ = taxonomy_client
    categories, brands = taxonomy_data
    objects = categories if resource == "categories" else brands
    response = await client.get(f"/v1/{resource}")
    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"data", "page", "limit", "total"}
    assert (payload["page"], payload["limit"], payload["total"]) == (1, 24, 3)
    assert [row["id"] for row in payload["data"]] == [str(objects[key].id) for key in ("first", "second", "third")]
    assert [row["productCount"] for row in payload["data"]] == ([2, 1, 1] if resource == "categories" else [2, 1, 2])
    expected_keys = {"id", "slug", "name", "productCount"}
    if resource == "categories":
        expected_keys.add("parentId")
        assert [row["parentId"] for row in payload["data"]] == [None, str(categories["first"].id), None]
    for row in payload["data"]:
        assert set(row) == expected_keys
    assert "Private supplier" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["categories", "brands"])
async def test_search_and_pagination(taxonomy_client, taxonomy_data, resource):
    client, _, _ = taxonomy_client
    objects = taxonomy_data[0 if resource == "categories" else 1]
    # Name search includes equal names; UUID breaks ties stably across pages.
    name = objects["first"].name.upper()
    for page, key in [(1, "first"), (2, "second")]:
        response = await client.get(f"/v1/{resource}", params={"q": f" {name} ", "page": page, "limit": 1})
        assert response.status_code == 200
        assert response.json() == {
            "data": [{
                "id": str(objects[key].id), "slug": objects[key].slug, "name": objects[key].name,
                "productCount": 2 if key == "first" else 1,
                **({"parentId": str(objects["first"].id) if key == "second" else None} if resource == "categories" else {}),
            }], "page": page, "limit": 1, "total": 2,
        }
    slug_search = await client.get(f"/v1/{resource}", params={"q": "CUDDLY"})
    assert [row["id"] for row in slug_search.json()["data"]] == [str(objects["first"].id)]
    for q in ["no-match", "%", "_", "\\"]:
        response = await client.get(f"/v1/{resource}", params={"q": q})
        assert response.json()["data"] == []
        assert response.json()["total"] == 0
    beyond = await client.get(f"/v1/{resource}", params={"page": 99, "limit": 1})
    assert beyond.json() == {"data": [], "page": 99, "limit": 1, "total": 3}
    assert (await client.get(f"/v1/{resource}", params={"q": " " * 120, "limit": 100})).json()["total"] == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["categories", "brands"])
async def test_detail_by_uuid_and_slug_and_hidden_404(taxonomy_client, taxonomy_data, resource):
    client, _, _ = taxonomy_client
    objects = taxonomy_data[0 if resource == "categories" else 1]
    listing = (await client.get(f"/v1/{resource}")).json()["data"]
    for item in listing:
        for identifier in [item["id"], item["slug"]]:
            response = await client.get(f"/v1/{resource}/{identifier}")
            assert response.status_code == 200
            assert response.json() == {"data": item}
    hidden = [objects["draft"], objects["empty"]]
    if resource == "categories":
        hidden.append(objects["inactive"])
    for identifier in [str(uuid4()), "missing-slug", "not-a-uuid", *[value for obj in hidden for value in (str(obj.id), obj.slug)]]:
        response = await client.get(f"/v1/{resource}/{identifier}")
        assert response.status_code == 404
        assert set(response.json()) == {"detail"}


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["categories", "brands"])
@pytest.mark.parametrize("params", [
    {"page": 0}, {"page": -1}, {"page": "bad"},
    {"limit": 0}, {"limit": -1}, {"limit": 101}, {"limit": "bad"}, {"q": "a" * 121},
])
async def test_query_validation(taxonomy_client, resource, params):
    client, _, _ = taxonomy_client
    assert (await client.get(f"/v1/{resource}", params=params)).status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", ["categories", "brands"])
async def test_empty_lists_and_constant_query_count(taxonomy_client, taxonomy_data, resource):
    client, _, engine = taxonomy_client
    statements = []

    def capture(_connection, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", capture)
    try:
        for limit in [1, 100]:
            statements.clear()
            assert (await client.get(f"/v1/{resource}", params={"limit": limit})).status_code == 200
            assert len(statements) == 2
        statements.clear()
        slug = taxonomy_data[0 if resource == "categories" else 1]["first"].slug
        assert (await client.get(f"/v1/{resource}/{slug}")).status_code == 200
        assert len(statements) == 1
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", capture)


@pytest.mark.asyncio
async def test_empty_catalog_and_demo_links(taxonomy_client):
    client, sessions, _ = taxonomy_client
    for resource in ["categories", "brands"]:
        assert (await client.get(f"/v1/{resource}")).json() == {"data": [], "page": 1, "limit": 24, "total": 0}
    async with sessions() as db:
        db.add(Product(
            slug="demo-bunny", name="Demo Bunny", category_name="Bunnies", supplier_name="Demo Brand",
            price_amount=100, image_url="/images/demo.png", published=True,
        ))
        await db.flush()
        await link_demo_catalog(db)
        await db.commit()
    for resource, slug in [("categories", "bunnies"), ("brands", "demo-brand")]:
        payload = (await client.get(f"/v1/{resource}")).json()
        assert payload["total"] == 1
        assert payload["data"][0]["slug"] == slug
        assert payload["data"][0]["productCount"] == 1
        assert "is_demo" not in payload["data"][0]


def test_router_is_read_only_without_prefix_and_has_typed_responses():
    app = FastAPI()
    app.include_router(router, prefix="/v1")
    paths = app.openapi()["paths"]
    assert set(paths) == {"/v1/categories", "/v1/categories/{identifier}", "/v1/brands", "/v1/brands/{identifier}"}
    for operations in paths.values():
        assert set(operations) == {"get"}
        assert operations["get"]["tags"] == ["catalog"]
        assert "$ref" in operations["get"]["responses"]["200"]["content"]["application/json"]["schema"]