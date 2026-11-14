"""Development seed catalog keeps a varied five-item Rare Finds collection."""

from app.seed import PRODUCT_COLORS, PRODUCTS, PRODUCT_STATUSES
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import seed
from app.models import Base, Product, ProductImage, ProductVariant, SupplierInventory, SupplierOffer


def test_catalog_has_twenty_unique_products_and_ten_lineup_images():
    assert len(PRODUCTS) == 20
    slugs = {product["slug"] for product in PRODUCTS}
    assert len(slugs) == 20
    assert set(PRODUCT_COLORS) == slugs
    assert set(PRODUCT_STATUSES) == slugs
    lineup = [product for product in PRODUCTS if "/catalog/lineup/" in product["image"]]
    assert len(lineup) == 10
    assert len({product["image"] for product in lineup}) == 10
    public = Path(__file__).resolve().parents[2] / "public"
    for product in lineup:
        assert "demo" in product["tags"]
        assert product["alt"]
        assert (public / product["image"].lstrip("/")).is_file()
        assert PRODUCT_STATUSES[product["slug"]] == "Available"


@pytest.mark.asyncio
async def test_seed_twenty_products_is_idempotent_without_replenishing_stock(monkeypatch, tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'seed.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(seed, "SessionLocal", sessions)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        await seed.seed_products()
        async with sessions() as db:
            product = await db.scalar(select(Product).where(Product.slug == "mochi-cloud"))
            variant = await db.scalar(select(ProductVariant).where(ProductVariant.product_id == product.id))
            offer = await db.scalar(select(SupplierOffer).where(SupplierOffer.variant_id == variant.id))
            inventory = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == offer.id))
            variant.stock_quantity = 5
            inventory.on_hand = 5
            await db.commit()
        await seed.seed_products()
        async with sessions() as db:
            for model in (Product, ProductVariant, ProductImage, SupplierOffer, SupplierInventory):
                assert await db.scalar(select(func.count()).select_from(model)) == 20
            product = await db.scalar(select(Product).where(Product.slug == "mochi-cloud"))
            variant = await db.scalar(select(ProductVariant).where(ProductVariant.product_id == product.id))
            assert variant.stock_quantity == 5
            offer = await db.scalar(select(SupplierOffer).where(SupplierOffer.variant_id == variant.id))
            inventory = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == offer.id))
            assert inventory.on_hand == 5
    finally:
        await engine.dispose()


def test_development_catalog_has_five_distinct_rare_finds():
    rare = [product for product in PRODUCTS if "rare" in product["tags"]]
    assert len(rare) == 5
    assert len({product["slug"] for product in rare}) == 5
    assert {product["slug"] for product in rare} == {
        "hoshi-cloud-bear", "mint-dino", "cherry-blossom-bunny",
        "better-days-panda", "cloud-cat",
    }
    assert all(product["slug"] in PRODUCT_COLORS for product in rare)
    assert all(PRODUCT_STATUSES[product["slug"]] == "Available" for product in rare)
