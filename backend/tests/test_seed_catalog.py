"""Development seed catalog keeps a varied five-item Rare Finds collection."""

from app.seed import PRODUCT_COLORS, PRODUCTS, PRODUCT_STATUSES


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
