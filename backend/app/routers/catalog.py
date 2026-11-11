"""Public, published-product-backed category and brand discovery."""

from typing import Any, Generic, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.db import get_db
from app.models import Brand, Product, ProductCategory

router = APIRouter(tags=["catalog"])


class BrandOut(BaseModel):
    id: UUID
    slug: str
    name: str
    productCount: int


class CategoryOut(BrandOut):
    parentId: UUID | None


TaxonomyItem = TypeVar("TaxonomyItem", bound=BrandOut)


class TaxonomyPage(BaseModel, Generic[TaxonomyItem]):
    data: list[TaxonomyItem]
    page: int
    limit: int
    total: int


class TaxonomyDetail(BaseModel, Generic[TaxonomyItem]):
    data: TaxonomyItem


def _taxonomy_query(model: type[ProductCategory] | type[Brand]) -> Select[Any]:
    product_key = Product.category_id if model is ProductCategory else Product.brand_id
    counts = (
        select(product_key.label("taxonomy_id"), func.count(Product.id).label("productCount"))
        .where(Product.published.is_(True))
        .group_by(product_key)
        .subquery()
    )
    query = select(model.id, model.slug, model.name, counts.c.productCount).join(
        counts, counts.c.taxonomy_id == model.id,
    )
    if model is ProductCategory:
        parent = aliased(ProductCategory)
        visible_parent = (
            select(parent.id)
            .where(parent.id == ProductCategory.parent_id, parent.active.is_(True))
            .correlate(ProductCategory)
            .scalar_subquery()
        )
        query = query.add_columns(visible_parent.label("parentId")).where(ProductCategory.active.is_(True))
    return query


async def _list_taxonomy(
    db: AsyncSession, model: type[ProductCategory] | type[Brand],
    output: type[TaxonomyItem], q: str | None, page: int, limit: int,
) -> TaxonomyPage[TaxonomyItem]:
    query = _taxonomy_query(model)
    if q and q.strip():
        # Escape SQL wildcards so searches are literal, case-insensitive substrings.
        term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(or_(
            model.name.ilike(f"%{term}%", escape="\\"),
            model.slug.ilike(f"%{term}%", escape="\\"),
        ))
    total = int(await db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = (await db.execute(
        query.order_by(model.name.asc(), model.id.asc()).offset((page - 1) * limit).limit(limit),
    )).mappings().all()
    return TaxonomyPage[output](
        data=[output.model_validate(row) for row in rows], page=page, limit=limit, total=total,
    )


async def _get_taxonomy(
    db: AsyncSession, model: type[ProductCategory] | type[Brand],
    output: type[TaxonomyItem], identifier: str,
) -> TaxonomyDetail[TaxonomyItem]:
    condition = model.slug == identifier
    try:
        identifier_id = UUID(identifier)
    except ValueError:
        pass
    else:
        condition = or_(model.id == identifier_id, condition)
    row = (await db.execute(_taxonomy_query(model).where(condition).order_by(model.id).limit(1))).mappings().first()
    if row is None:
        label = "Category" if model is ProductCategory else "Brand"
        raise HTTPException(status_code=404, detail=f"{label} not found.")
    return TaxonomyDetail[output](data=output.model_validate(row))


@router.get("/categories", response_model=TaxonomyPage[CategoryOut])
async def list_categories(
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> TaxonomyPage[CategoryOut]:
    return await _list_taxonomy(db, ProductCategory, CategoryOut, q, page, limit)


@router.get("/categories/{identifier}", response_model=TaxonomyDetail[CategoryOut])
async def get_category(identifier: str, db: AsyncSession = Depends(get_db)) -> TaxonomyDetail[CategoryOut]:
    return await _get_taxonomy(db, ProductCategory, CategoryOut, identifier)


@router.get("/brands", response_model=TaxonomyPage[BrandOut])
async def list_brands(
    q: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> TaxonomyPage[BrandOut]:
    return await _list_taxonomy(db, Brand, BrandOut, q, page, limit)


@router.get("/brands/{identifier}", response_model=TaxonomyDetail[BrandOut])
async def get_brand(identifier: str, db: AsyncSession = Depends(get_db)) -> TaxonomyDetail[BrandOut]:
    return await _get_taxonomy(db, Brand, BrandOut, identifier)