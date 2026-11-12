import asyncio
import re
from datetime import datetime, timezone
from uuid import uuid5, NAMESPACE_URL

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Product, ProductVariant
from app.config import settings
from app.storefront_data import link_demo_catalog

PRODUCTS = [
    {"slug": "hoshi-cloud-bear", "name": "Hoshi Cloud Bear", "description": "A warm, squishy cream teddy bear with a classic gingham bow.", "price": 18800, "category": "Bears", "type": "Plush", "tags": ["bear", "new-arrival", "rare"], "size": "Medium", "dimensions": "30 cm", "supplier": "Ponyo", "image": "/images/catalog/maker-bear.jpg", "alt": "Warm cream teddy bear plush with a checkered bow", "stock": 20},
    {"slug": "haneul-bunny", "name": "Haneul Bunny", "description": "A soft, long-eared bunny in cream with a blue bow.", "price": 17800, "category": "Bunnies", "type": "Plush", "tags": ["bunny", "new-arrival", "premium"], "size": "Medium", "dimensions": "35 cm", "supplier": "Ponyo", "image": "/images/catalog/maker-bunny.jpg", "alt": "Cream bunny plush with long ears and a blue bow", "stock": 20},
    {"slug": "mint-dino", "name": "Mint Dino", "description": "A mint-green dinosaur with soft spikes and a friendly, curious face.", "price": 21200, "category": "Characters", "type": "Plush", "tags": ["character", "new-arrival", "rare"], "size": "Small", "dimensions": "28 cm", "supplier": "Ponyo", "image": "/images/catalog/maker-dinosaur.jpg", "alt": "Mint green dinosaur plush with soft spikes", "stock": 20},
    {"slug": "cherry-blossom-bunny", "name": "Cherry Blossom Bunny", "description": "A rosy bunny with a little flower nestled by its ear. A limited springtime friend from Studio Haneul.", "price": 22900, "category": "Bunnies", "type": "Plush", "tags": ["bunny", "rare", "limited-edition"], "size": "Small", "dimensions": "26 cm", "supplier": "Studio Haneul · South Korea", "image": "/images/catalog/maker-pink-bunny.jpg", "alt": "Soft pink bunny plush with a small flower detail", "stock": 8},
    {"slug": "better-days-panda", "name": "Better Days Panda", "description": "A cloud-soft panda with a blush bow and a little reminder to stay happy.", "price": 25600, "category": "Pandas", "type": "Plush", "tags": ["panda", "rare", "premium"], "size": "Medium", "dimensions": "32 cm", "supplier": "Ponyo selected maker", "image": "/images/catalog/ponyo-12.png", "alt": "Cream and charcoal panda plush with a blush bow", "stock": 6},
    {"slug": "cloud-cat", "name": "Cloud Cat", "description": "A sleepy cream-and-caramel cat plush, soft as a little cloud and hard to find.", "price": 19600, "category": "Cats", "type": "Plush", "tags": ["cat", "rare", "limited-edition"], "size": "Small", "dimensions": "24 cm", "supplier": "Ponyo selected maker", "image": "/images/catalog/maker-cat.jpg", "alt": "Sleepy cream cat plush with caramel markings", "stock": 7},
    {"slug": "bluebell-penguin", "name": "Bluebell Penguin", "description": "A tiny round penguin in soft blue and snowy white.", "price": 27500, "category": "Penguins", "type": "Plush", "tags": ["new-arrival", "penguin", "premium"], "size": "Small", "dimensions": "25 cm", "supplier": "Ponyo", "image": "/images/catalog/maker-penguin.jpg", "alt": "Round blue and white penguin plush", "stock": 20},
    {"slug": "hoshi-cloud-bear-xl", "name": "Hoshi Cloud Bear XL", "description": "The 90 cm giant version of Hoshi Cloud Bear. An extra-big cuddle buddy from Domina.", "price": 68000, "category": "Giant plush", "type": "XL Plush", "tags": ["bear", "domina-xl"], "size": "XL", "dimensions": "90 cm", "supplier": "Domina", "image": "/images/catalog/maker-bear.jpg", "alt": "Warm cream teddy bear plush with a checkered bow", "stock": 3},
    {"slug": "haneul-bunny-xl", "name": "Haneul Bunny XL", "description": "A giant cream bunny standing 100 cm tall, from Domina.", "price": 74500, "category": "Giant plush", "type": "XL Plush", "tags": ["bunny", "domina-xl"], "size": "XL", "dimensions": "100 cm", "supplier": "Domina", "image": "/images/catalog/maker-bunny.jpg", "alt": "Oversized cream bunny plush shown at room scale", "stock": 3},
    {"slug": "baluran-elephant-xl", "name": "Baluran Elephant XL", "description": "An extra-large 120 cm elephant plush from Domina, the centrepiece of any room.", "price": 89000, "category": "Giant plush", "type": "XL Plush", "tags": ["character", "domina-xl"], "size": "XL", "dimensions": "120 cm", "supplier": "Domina", "image": "/images/catalog/ponyo-6.png", "alt": "An oversized elephant plush", "stock": 3},
]

PRODUCT_COLORS = {
    "hoshi-cloud-bear": "Cream",
    "haneul-bunny": "Cream",
    "mint-dino": "Mint green",
    "cherry-blossom-bunny": "Pink",
    "better-days-panda": "Cream and charcoal",
    "cloud-cat": "Cream and caramel",
    "bluebell-penguin": "Blue and white",
    "hoshi-cloud-bear-xl": "Cream",
    "haneul-bunny-xl": "Cream",
    "baluran-elephant-xl": "Grey",
}

PRODUCT_STATUSES = {
    "hoshi-cloud-bear": "Available",
    "haneul-bunny": "Coming Soon",
    "mint-dino": "Available",
    "cherry-blossom-bunny": "Available",
    "better-days-panda": "Available",
    "cloud-cat": "Available",
    "bluebell-penguin": "Available",
    "hoshi-cloud-bear-xl": "Available",
    "haneul-bunny-xl": "Waitlist",
    "baluran-elephant-xl": "Unavailable",
}


def stable_id(value: str):
    return uuid5(NAMESPACE_URL, f"https://ponyo.example/products/{value}")


async def seed_products() -> None:
    if settings.environment == "production":
        raise RuntimeError("Demo catalog and supplier seeds must not run in production.")
    async with SessionLocal() as db:
        for item in PRODUCTS:
            product_id = stable_id(item["slug"])
            status = PRODUCT_STATUSES[item["slug"]]
            stock_quantity = item["stock"] if status == "Available" else 0
            product = await db.scalar(select(Product).where(Product.slug == item["slug"]))
            if product is None:
                product = Product(
                    id=product_id,
                    sku=f"PNY-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper()).strip('-')}",
                    slug=item["slug"],
                    name=item["name"],
                    description=item["description"],
                    currency="JPY",
                    price_amount=item["price"],
                    availability="available" if status == "Available" else "unavailable",
                    availability_status=status,
                    category_name=item["category"],
                    product_type=item["type"],
                    supplier_name=item["supplier"],
                    image_url=item["image"],
                    image_alt=item["alt"],
                    tags=item["tags"],
                    size_tier=item["size"],
                    dimensions=item["dimensions"],
                    dispatch_time="Ships in 1–3 business days",
                    published=True,
                )
                db.add(product)
                await db.flush()
            else:
                product.sku = f"PNY-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper()).strip('-')}"
                product.name = item["name"]
                product.description = item["description"]
                product.currency = "JPY"
                product.price_amount = item["price"]
                product.availability = "available" if status == "Available" else "unavailable"
                product.availability_status = status
                product.category_name = item["category"]
                product.product_type = item["type"]
                product.supplier_name = item["supplier"]
                product.image_url = item["image"]
                product.image_alt = item["alt"]
                product.tags = item["tags"]
                product.size_tier = item["size"]
                product.dimensions = item["dimensions"]
                product.dispatch_time = "Ships in 1–3 business days"
                product.published = True
            history = list(product.price_history or [])
            today = datetime.now(timezone.utc).date().isoformat()
            if history and history[-1].get("date") == today:
                history[-1] = {"date": today, "price": item["price"]}
            elif not history or history[-1].get("price") != item["price"]:
                history.append({"date": today, "price": item["price"]})
            product.price_history = history
            variant = await db.scalar(select(ProductVariant).where(ProductVariant.product_id == product.id, ProductVariant.title == "Default"))
            if variant is None:
                db.add(ProductVariant(
                    id=stable_id(f"{item['slug']}-default"),
                    product_id=product.id,
                    title="Default",
                    sku=f"PNV-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper()).strip('-')}-DEFAULT",
                    options={"Size": item["size"], "Color": PRODUCT_COLORS[item["slug"]]},
                    currency="JPY",
                    price_amount=item["price"],
                    stock_quantity=stock_quantity,
                    active=True,
                ))
            else:
                variant.sku = f"PNV-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper()).strip('-')}-DEFAULT"
                variant.options = {"Size": item["size"], "Color": PRODUCT_COLORS[item["slug"]]}
                variant.options = {"Size": item["size"], "Color": PRODUCT_COLORS[item["slug"]]}
                variant.currency = "JPY"
                variant.price_amount = item["price"]
                # Re-running the fixture must not replenish previously reserved/sold stock.
                variant.active = True
        await db.flush()
        await link_demo_catalog(db)
        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed_products())
