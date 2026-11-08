import asyncio
import re
from uuid import uuid5, NAMESPACE_URL

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Product, ProductVariant

PRODUCTS = [
    {"slug": "hoshi-cloud-bear", "name": "Hoshi Cloud Bear", "description": "A warm, squishy cream teddy bear with a classic gingham bow.", "price": 18800, "category": "Bears", "type": "Plush", "tags": ["bear", "new-arrival", "rare"], "size": "Medium", "dimensions": "30 cm", "supplier": "Ponyo", "image": "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-bear.jpg?v=1793843383", "alt": "Warm cream teddy bear plush with a checkered bow", "stock": 20},
    {"slug": "haneul-bunny", "name": "Haneul Bunny", "description": "A soft, long-eared bunny in cream with a blue bow.", "price": 17800, "category": "Bunnies", "type": "Plush", "tags": ["bunny", "new-arrival", "premium"], "size": "Medium", "dimensions": "35 cm", "supplier": "Ponyo", "image": "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-bunny.jpg?v=1793843383", "alt": "Cream bunny plush with long ears and a blue bow", "stock": 20},
    {"slug": "mint-dino", "name": "Mint Dino", "description": "A mint-green dinosaur with soft spikes and a friendly, curious face.", "price": 21200, "category": "Characters", "type": "Plush", "tags": ["character", "new-arrival", "rare"], "size": "Small", "dimensions": "28 cm", "supplier": "Ponyo", "image": "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-dinosaur.jpg?v=1793843384", "alt": "Mint green dinosaur plush with soft spikes", "stock": 20},
    {"slug": "bluebell-penguin", "name": "Bluebell Penguin", "description": "A tiny round penguin in soft blue and snowy white.", "price": 27500, "category": "Penguins", "type": "Plush", "tags": ["new-arrival", "penguin", "premium"], "size": "Small", "dimensions": "25 cm", "supplier": "Ponyo", "image": "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-penguin.jpg?v=1793843384", "alt": "Round blue and white penguin plush", "stock": 20},
    {"slug": "hoshi-cloud-bear-xl", "name": "Hoshi Cloud Bear XL", "description": "The 90 cm giant version of Hoshi Cloud Bear. An extra-big cuddle buddy from Domina.", "price": 68000, "category": "Giant plush", "type": "XL Plush", "tags": ["bear", "domina-xl"], "size": "XL", "dimensions": "90 cm", "supplier": "Domina", "image": "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-bear.jpg?v=1793843383", "alt": "Warm cream teddy bear plush with a checkered bow", "stock": 3},
    {"slug": "haneul-bunny-xl", "name": "Haneul Bunny XL", "description": "A giant cream bunny standing 100 cm tall, from Domina.", "price": 74500, "category": "Giant plush", "type": "XL Plush", "tags": ["bunny", "domina-xl"], "size": "XL", "dimensions": "100 cm", "supplier": "Domina", "image": "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/maker-bunny.jpg?v=1793843383", "alt": "Oversized cream bunny plush shown at room scale", "stock": 3},
    {"slug": "baluran-elephant-xl", "name": "Baluran Elephant XL", "description": "An extra-large 120 cm elephant plush from Domina, the centrepiece of any room.", "price": 89000, "category": "Giant plush", "type": "XL Plush", "tags": ["character", "domina-xl"], "size": "XL", "dimensions": "120 cm", "supplier": "Domina", "image": "https://cdn.shopify.com/s/files/1/0821/0690/8783/files/ponyo-6.png?v=1793843378", "alt": "An oversized elephant plush", "stock": 3},
]


def stable_id(value: str):
    return uuid5(NAMESPACE_URL, f"https://ponyo.example/products/{value}")


async def seed_products() -> None:
    async with SessionLocal() as db:
        for item in PRODUCTS:
            product_id = stable_id(item["slug"])
            product = await db.scalar(select(Product).where(Product.slug == item["slug"]))
            if product is None:
                product = Product(
                    id=product_id,
                    slug=item["slug"],
                    name=item["name"],
                    description=item["description"],
                    currency="JPY",
                    price_amount=item["price"],
                    availability="available",
                    availability_status="Available",
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
                product.name = item["name"]
                product.description = item["description"]
                product.currency = "JPY"
                product.price_amount = item["price"]
                product.availability = "available"
                product.availability_status = "Available"
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
            variant = await db.scalar(select(ProductVariant).where(ProductVariant.product_id == product.id, ProductVariant.title == "Default"))
            if variant is None:
                db.add(ProductVariant(
                    id=stable_id(f"{item['slug']}-default"),
                    product_id=product.id,
                    title="Default",
                    sku=f"PNY-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper())}",
                    currency="JPY",
                    price_amount=item["price"],
                    stock_quantity=item["stock"],
                    active=True,
                ))
            else:
                variant.currency = "JPY"
                variant.price_amount = item["price"]
                variant.stock_quantity = item["stock"]
                variant.active = True
        await db.commit()


if __name__ == "__main__":
    asyncio.run(seed_products())
