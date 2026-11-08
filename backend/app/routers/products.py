from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models import Product, ProductVariant
from app.schemas import ProductOut, VariantOut

router = APIRouter(prefix="/products", tags=["catalog"])


def product_response(product: Product) -> ProductOut:
    variants = [
        VariantOut(
            id=str(variant.id),
            title=variant.title,
            priceAmount=variant.price_amount,
            currency=variant.currency,
            compareAtAmount=variant.compare_at_amount,
            availability="available" if variant.active and variant.stock_quantity > 0 else "unavailable",
        )
        for variant in product.variants
        if variant.active
    ]
    default_variant = next((variant for variant in variants if variant.availability == "available"), variants[0] if variants else None)
    availability = "available" if default_variant and default_variant.availability == "available" else "unavailable"
    return ProductOut(
        id=str(product.id),
        slug=product.slug,
        name=product.name,
        description=product.description,
        priceAmount=default_variant.priceAmount if default_variant else product.price_amount,
        compareAtAmount=default_variant.compareAtAmount if default_variant else product.compare_at_amount,
        currency=default_variant.currency if default_variant else product.currency,
        availability=availability,
        availabilityStatus=product.availability_status,
        categoryName=product.category_name,
        productType=product.product_type,
        supplierName=product.supplier_name,
        image=product.image_url,
        imageAlt=product.image_alt,
        tags=product.tags or [],
        sizeTier=product.size_tier,
        dimensions=product.dimensions,
        dispatchTime=product.dispatch_time,
        variantId=str(default_variant.id) if default_variant else None,
        variants=variants,
    )


@router.get("", response_model=dict)
async def list_products(
    q: str | None = None,
    category: str | None = None,
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    size: str | None = None,
    sort: str = "best-selling",
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Product).where(Product.published.is_(True)).options(selectinload(Product.variants))
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Product.name.ilike(term), Product.description.ilike(term), Product.category_name.ilike(term)))
    if category:
        query = query.where(Product.category_name.ilike(category.strip()))
    if size:
        query = query.where(Product.size_tier.ilike(size.strip()))
    variant_price = select(func.min(ProductVariant.price_amount)).where(
        ProductVariant.product_id == Product.id,
        ProductVariant.active.is_(True),
        ProductVariant.stock_quantity > 0,
    ).correlate(Product).scalar_subquery()
    if min_price is not None or max_price is not None:
        price_conditions = [ProductVariant.active.is_(True), ProductVariant.stock_quantity > 0]
        if min_price is not None:
            price_conditions.append(ProductVariant.price_amount >= min_price)
        if max_price is not None:
            price_conditions.append(ProductVariant.price_amount <= max_price)
        eligible_product = select(ProductVariant.id).where(
            ProductVariant.product_id == Product.id,
            *price_conditions,
        ).exists()
        query = query.where(eligible_product)

    sort_columns = {
        "price-ascending": variant_price.asc().nulls_last(),
        "price-descending": variant_price.desc().nulls_last(),
        "title-descending": Product.name.desc(),
        "created-descending": Product.created_at.desc(),
        # Until paid order analytics are populated, newest is the deterministic merchandising fallback.
        "best-selling": Product.created_at.desc(),
    }
    query = query.order_by(sort_columns.get(sort, Product.name.asc()))
    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    total = int(await db.scalar(count_query) or 0)
    rows = (await db.scalars(query.offset((page - 1) * limit).limit(limit))).all()
    return {"data": [product_response(product).model_dump(mode="json") for product in rows], "page": page, "limit": limit, "total": total}


@router.get("/{slug}", response_model=dict)
async def get_product(slug: str, db: AsyncSession = Depends(get_db)):
    product = await db.scalar(
        select(Product).where(Product.slug == slug, Product.published.is_(True)).options(selectinload(Product.variants))
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return {"data": product_response(product).model_dump(mode="json")}
