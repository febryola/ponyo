from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from uuid import UUID
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.media import storefront_image_url
from app.models import Customer, Order, OrderItem, OutboxEvent, Product, ProductReview, ProductVariant, ProductWaitlistEntry
from app.schemas import ProductOut, ProductReviewCreate, ProductWaitlistRequest, VariantOut
from app.security import get_current_customer, get_optional_customer, require_csrf
from app.rate_limit import enforce_rate_limit
from app.translations import AWS_TRANSLATE_CODES, get_product_translation

router = APIRouter(prefix="/products", tags=["catalog"])


async def product_by_id(product_id: UUID, db: AsyncSession) -> Product:
    product = await db.scalar(
        select(Product).where(Product.id == product_id, Product.published.is_(True))
        .options(selectinload(Product.variants))
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


def product_response(product: Product, translated_name: str | None = None, translated_description: str | None = None) -> ProductOut:
    variants = [
        VariantOut(
            id=str(variant.id),
            sku=variant.sku,
            title=variant.title,
            priceAmount=variant.price_amount,
            currency=variant.currency,
            compareAtAmount=variant.compare_at_amount,
            availability="available" if variant.active and variant.stock_quantity > 0 else "unavailable",
            options=variant.options or {},
        )
        for variant in product.variants
        if variant.active
    ]
    default_variant = next((variant for variant in variants if variant.availability == "available"), variants[0] if variants else None)
    availability = "available" if default_variant and default_variant.availability == "available" else "unavailable"
    return ProductOut(
        id=str(product.id),
        sku=product.sku,
        slug=product.slug,
        name=translated_name or product.name,
        description=translated_description if translated_description is not None else product.description,
        priceAmount=default_variant.priceAmount if default_variant else product.price_amount,
        compareAtAmount=default_variant.compareAtAmount if default_variant else product.compare_at_amount,
        currency=default_variant.currency if default_variant else product.currency,
        availability=availability,
        availabilityStatus=product.availability_status,
        priceHistory=product.price_history or [],
        categoryName=product.category_name,
        productType=product.product_type,
        supplierName=product.supplier_name,
        image=storefront_image_url(product.image_url),
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
    locale: str = Query(default="en", min_length=2, max_length=12),
    db: AsyncSession = Depends(get_db),
):
    locale = locale if locale == "en" or locale in AWS_TRANSLATE_CODES else "en"
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
    data = []
    for product in rows:
        translation = await get_product_translation(product, locale, db) if locale != "en" else None
        data.append(product_response(
            product,
            translation.name if translation else None,
            translation.description if translation else None,
        ).model_dump(mode="json"))
    if locale != "en":
        await db.commit()
    return {"data": data, "page": page, "limit": limit, "total": total}


@router.get("/{product_id}", response_model=dict)
async def get_product(
    product_id: str,
    locale: str = Query(default="en", min_length=2, max_length=12),
    db: AsyncSession = Depends(get_db),
):
    locale = locale if locale == "en" or locale in AWS_TRANSLATE_CODES else "en"
    try:
        identifier = UUID(product_id)
        product_filter = Product.id == identifier
    except ValueError:
        # Accept legacy product handles so storefront routes can redirect old links to canonical IDs.
        product_filter = Product.slug == product_id
    product = await db.scalar(
        select(Product).where(product_filter, Product.published.is_(True)).options(selectinload(Product.variants))
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    translation = await get_product_translation(product, locale, db) if locale != "en" else None
    if translation:
        await db.commit()
    return {"data": product_response(
        product,
        translation.name if translation else None,
        translation.description if translation else None,
    ).model_dump(mode="json")}


@router.get("/{product_id}/reviews", response_model=dict)
async def list_product_reviews(product_id: UUID, db: AsyncSession = Depends(get_db)):
    await product_by_id(product_id, db)
    reviews = await db.scalars(
        select(ProductReview).where(ProductReview.product_id == product_id, ProductReview.published.is_(True))
        .order_by(ProductReview.created_at.desc()).limit(100)
    )
    rows = list(reviews)
    review_count = int(await db.scalar(
        select(func.count(ProductReview.id)).where(ProductReview.product_id == product_id, ProductReview.published.is_(True))
    ) or 0)
    average = float(await db.scalar(
        select(func.avg(ProductReview.rating)).where(ProductReview.product_id == product_id, ProductReview.published.is_(True))
    ) or 0)
    return {"data": {
        "averageRating": round(average, 1),
        "reviewCount": review_count,
        "reviews": [{
            "id": str(review.id), "reviewerName": review.reviewer_name,
            "rating": review.rating, "title": review.title, "body": review.body,
            "photos": review.photos or [],
            "verifiedPurchase": review.verified_purchase, "createdAt": review.created_at.isoformat(),
        } for review in rows],
    }}


@router.post("/{product_id}/reviews", response_model=dict)
async def create_product_review(
    product_id: UUID,
    payload: ProductReviewCreate,
    request: Request,
    customer: Customer = Depends(get_current_customer),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "product-review", 5, 3600)
    await product_by_id(product_id, db)
    review = await db.scalar(select(ProductReview).where(
        ProductReview.product_id == product_id,
        ProductReview.customer_id == customer.id,
    ))
    if not review:
        verified_purchase = bool(await db.scalar(
            select(OrderItem.id)
            .join(Order, Order.id == OrderItem.order_id)
            .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
            .where(
                Order.customer_id == customer.id,
                ProductVariant.product_id == product_id,
                Order.payment_status == "paid",
            ).limit(1)
        ))
        review = ProductReview(
            product_id=product_id,
            customer_id=customer.id,
            reviewer_name=customer.first_name.strip() or "Ponyo customer",
            verified_purchase=verified_purchase,
        )
        db.add(review)
    review.rating = payload.rating
    review.title = payload.title.strip()
    review.body = payload.body.strip()
    review.photos = payload.photos
    review.reviewer_name = customer.first_name.strip() or "Ponyo customer"
    review.published = True
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Your review could not be saved. Please try again.") from None
    await db.refresh(review)
    return {"data": {
        "id": str(review.id), "reviewerName": review.reviewer_name,
        "rating": review.rating, "title": review.title, "body": review.body,
        "photos": review.photos or [],
        "verifiedPurchase": review.verified_purchase, "createdAt": review.created_at.isoformat(),
    }}


@router.post("/{product_id}/waitlist", response_model=dict)
async def join_product_waitlist(
    product_id: UUID,
    payload: ProductWaitlistRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    customer: Customer | None = Depends(get_optional_customer),
):
    require_csrf(request)
    await enforce_rate_limit(request, "product-waitlist", 10, 3600)
    product = await product_by_id(product_id, db)
    email = str(payload.email).lower().strip()
    existing = await db.scalar(select(ProductWaitlistEntry).where(
        ProductWaitlistEntry.product_id == product_id,
        ProductWaitlistEntry.email == email,
    ))
    if existing:
        if customer and existing.customer_id is None and customer.email == email:
            existing.customer_id = customer.id
            existing.first_name = payload.firstName.strip() or customer.first_name
            await db.commit()
        return {"data": {"accepted": True}}
    entry = ProductWaitlistEntry(
        product_id=product_id,
        customer_id=customer.id if customer and customer.email == email else None,
        email=email,
        first_name=payload.firstName.strip() or (customer.first_name if customer and customer.email == email else ""),
    )
    db.add(entry)
    db.add(OutboxEvent(event_type="product.waitlist_joined", payload={
        "productId": str(product.id), "productName": product.name, "email": email,
    }))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
    return {"data": {"accepted": True}}
