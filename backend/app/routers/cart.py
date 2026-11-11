"""Verified-customer carts. Cart contents never reserve or price inventory."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.catalog_stock import available_quantities
from app.currency import SUPPORTED_CURRENCIES
from app.db import get_db
from app.media import storefront_image_url
from app.models import (
    CartItem, Customer, Product, ProductVariant, ShoppingCart,
    Supplier, SupplierInventory, SupplierOffer, utc_now,
)
from app.security import get_current_customer, require_csrf
from app.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/cart", tags=["cart"])


class CartItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variantId: UUID
    quantity: int = Field(ge=1, le=99, strict=True)


class CartUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currency: str = Field(min_length=3, max_length=3)
    items: list[CartItemUpdate] = Field(max_length=100)

    @field_validator("currency")
    @classmethod
    def supported_currency(cls, value: str) -> str:
        value = value.upper()
        if value not in SUPPORTED_CURRENCIES:
            raise ValueError("Unsupported currency.")
        return value

    @field_validator("items")
    @classmethod
    def unique_variants(cls, items: list[CartItemUpdate]) -> list[CartItemUpdate]:
        if len({item.variantId for item in items}) != len(items):
            raise ValueError("Each variant may appear only once.")
        return items


class ValidationItem(CartItemUpdate):
    expectedPriceAmount: int | None = Field(default=None, ge=0, strict=True)
    expectedCurrency: str | None = Field(default=None, min_length=3, max_length=3)


class ValidationRequest(CartUpdate):
    items: list[ValidationItem] = Field(max_length=100)


@router.post("/validate", response_model=dict)
async def validate_cart(
    payload: ValidationRequest, request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Stateless public snapshot; no cart writes, reservations, or currency conversion.

    Subtotal includes all visible lines (even insufficient-stock lines) at current
    source prices. Mixed source currencies yield a zero subtotal and null currency.
    Changes must be acknowledged by revalidating with current expectations.
    """
    await enforce_rate_limit(request, "cart-validate", 60, 60)
    variants = {
        variant.id: variant for variant in await db.scalars(
            select(ProductVariant).join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.id.in_([item.variantId for item in payload.items]),
                ProductVariant.active.is_(True), Product.published.is_(True),
            ).options(selectinload(ProductVariant.product).options(
                selectinload(Product.images), selectinload(Product.brand),
            ))
        )
    } if payload.items else {}
    quantities = await available_quantities(db, variants.values())
    currencies = {variant.currency for variant in variants.values()}
    mixed = len(currencies) > 1
    source_currency = next(iter(currencies)) if len(currencies) == 1 else None
    lines = []
    subtotal = 0
    for item in payload.items:
        variant = variants.get(item.variantId)
        line = {
            "variantId": str(item.variantId), "productId": None,
            "quantity": item.quantity, "name": "Product unavailable",
            "image": None, "imageAlt": None, "maker": None, "slug": None,
            "priceAmount": None, "currency": None, "availableQuantity": 0,
            "availability": "unavailable", "issues": [], "priceChanged": False,
        }
        if variant is None:
            line["issues"].append("product_unavailable")
        else:
            product = variant.product
            image = product.images[0] if product.images else None
            quantity = quantities.get(variant.id, 0)
            line.update({
                "productId": str(product.id), "name": product.name,
                "image": storefront_image_url(image.url if image else product.image_url),
                "imageAlt": image.alt if image else product.image_alt,
                "maker": product.brand.name if product.brand else product.supplier_name,
                "slug": product.slug, "priceAmount": variant.price_amount,
                "currency": variant.currency, "availableQuantity": quantity,
                "availability": "available" if item.quantity <= quantity else "unavailable",
            })
            if item.quantity > quantity:
                line["issues"].append("insufficient_stock")
            if item.expectedPriceAmount is not None and item.expectedPriceAmount != variant.price_amount:
                line["issues"].append("price_changed")
            if item.expectedCurrency is not None and item.expectedCurrency.upper() != variant.currency.upper():
                line["issues"].append("currency_changed")
            line["priceChanged"] = any(issue in line["issues"] for issue in ("price_changed", "currency_changed"))
            subtotal += variant.price_amount * item.quantity
        if mixed:
            line["issues"].append("mixed_currency")
        lines.append(line)
    return {"data": {
        "items": lines,
        "canCheckout": bool(lines) and all(not line["issues"] for line in lines),
        "subtotalAmount": 0 if mixed else subtotal, "sourceCurrency": source_currency,
    }}


async def _cart_data(db: AsyncSession, customer_id: UUID) -> dict:
    cart = await db.scalar(select(ShoppingCart).where(ShoppingCart.customer_id == customer_id))
    if cart is None:
        return {"id": None, "currency": "JPY", "items": []}
    # Read columns rather than the ORM collection, which a bulk DELETE can leave stale.
    items = (await db.execute(
        select(CartItem.variant_id, CartItem.quantity, ProductVariant.product_id)
        .join(ShoppingCart, ShoppingCart.id == CartItem.cart_id)
        .join(ProductVariant, ProductVariant.id == CartItem.variant_id)
        .where(ShoppingCart.customer_id == customer_id, CartItem.cart_id == cart.id)
        .order_by(CartItem.created_at, CartItem.id)
    )).all()
    return {
        "id": str(cart.id), "currency": cart.currency,
        "items": [{"variantId": str(variant_id), "quantity": quantity, "productId": str(product_id)} for variant_id, quantity, product_id in items],
    }


async def _locked_cart(db: AsyncSession, customer_id: UUID, currency: str) -> ShoppingCart:
    owned_cart = select(ShoppingCart).where(ShoppingCart.customer_id == customer_id).with_for_update()
    cart = await db.scalar(owned_cart)
    if cart is not None:
        return cart
    try:
        # A concurrent first PUT may win the unique customer_id insert. Only roll
        # back this savepoint, not the surrounding replacement transaction.
        async with db.begin_nested():
            cart = ShoppingCart(customer_id=customer_id, currency=currency)
            db.add(cart)
            await db.flush()
    except IntegrityError:
        cart = await db.scalar(owned_cart)
        if cart is None:
            raise
    return cart


async def _validate_stock(db: AsyncSession, items: list[CartItemUpdate]) -> None:
    if not items:
        return
    variants = {
        variant.id: variant for variant in await db.scalars(
            select(ProductVariant).join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.id.in_([item.variantId for item in items]),
                ProductVariant.active.is_(True), Product.published.is_(True),
            )
        )
    }
    for item in items:
        variant = variants.get(item.variantId)
        if variant is None:
            raise HTTPException(422, "One or more variants are unavailable.")
        if variant.stock_quantity < item.quantity:
            raise HTTPException(409, "One or more items no longer have enough stock.")
        # Match checkout's supplier-stock fallback without reserving anything.
        has_offers = await db.scalar(
            select(SupplierOffer.id).where(SupplierOffer.variant_id == variant.id).limit(1)
        )
        if has_offers is not None:
            available_offer = await db.scalar(
                select(SupplierOffer.id)
                .join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
                .join(Supplier, Supplier.id == SupplierOffer.supplier_id)
                .where(
                    SupplierOffer.variant_id == variant.id, SupplierOffer.active.is_(True),
                    Supplier.active.is_(True), SupplierOffer.currency == variant.currency,
                    SupplierInventory.on_hand - SupplierInventory.reserved >= item.quantity,
                ).limit(1)
            )
            if available_offer is None:
                raise HTTPException(409, "One or more items no longer have supplier stock available.")


@router.get("", response_model=dict)
async def get_cart(
    customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db),
) -> dict:
    return {"data": await _cart_data(db, customer.id)}


@router.put("", response_model=dict, dependencies=[Depends(require_csrf)])
async def update_cart(
    payload: CartUpdate,
    customer: Customer = Depends(get_current_customer), db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await _validate_stock(db, payload.items)
        cart = await _locked_cart(db, customer.id, payload.currency)
        cart.currency = payload.currency
        cart.updated_at = utc_now()
        await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
        db.add_all([
            CartItem(cart_id=cart.id, variant_id=item.variantId, quantity=item.quantity)
            for item in payload.items
        ])
        await db.flush()
        data = await _cart_data(db, customer.id)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return {"data": data}