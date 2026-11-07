"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils/format-price";
import { saveWishlist, useWishlistHandles } from "@/lib/wishlist";
import type { Product } from "@/types/product";

export function ProductPurchasePanel({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState(product.variantId ?? product.variants?.[0]?.id ?? "");
  const savedHandles = useWishlistHandles();
  const saved = savedHandles.includes(product.slug);
  const selectedVariant = product.variants?.find((variant) => variant.id === selectedVariantId) ?? product.variants?.[0];
  const price = selectedVariant?.priceAmount ?? product.priceAmount;
  const currency = selectedVariant?.currency ?? product.currency;
  const compareAtAmount = selectedVariant?.compareAtAmount ?? product.compareAtAmount;
  const availability = selectedVariant?.availability ?? product.availability;

  function toggleWishlist() {
    const next = saved ? savedHandles.filter((slug) => slug !== product.slug) : [product.slug, ...savedHandles];
    saveWishlist(next);
  }

  function addToCart() {
    const image = typeof product.image === "string" ? product.image : product.image.src;
    window.dispatchEvent(new CustomEvent("ponyo:add-to-cart", {
      detail: {
        id: product.id,
        productId: product.shopifyProductId,
        variantId: selectedVariant?.id ?? product.variantId,
        slug: product.slug,
        name: product.name,
        maker: product.supplierName,
        price,
        currency,
        image,
        imageAlt: product.imageAlt,
        qty: quantity,
      },
    }));
  }

  const addButton = <button className="shop-button product-add-button" type="button" onClick={addToCart}>Add to cart <span>· {formatPrice(price, currency)}</span></button>;
  const soldOut = availability === "unavailable";
  const comingSoon = product.availabilityStatus === "Coming Soon";
  const statusLabel = comingSoon ? "Coming Soon" : soldOut ? "Sold out" : product.availabilityStatus ?? "Available";

  return (
    <>
      <div className="product-purchase-panel">
        <div className="product-status-badges"><p className={`product-availability${soldOut || comingSoon ? " is-muted" : ""}`}><span />{statusLabel}</p>{product.tags?.includes("rare") && <span className="product-rarity">Rare</span>}</div>
        <div className="product-title-row"><div><p className="eyebrow">Brand: {product.supplierName}</p><h1>{product.name}</h1></div><button type="button" className={`product-save${saved ? " is-saved" : ""}`} aria-label={`${saved ? "Remove from" : "Save to"} wishlist`} aria-pressed={saved} onClick={toggleWishlist}>{saved ? "♥" : "♡"}</button></div>
        <p className="product-detail-price">{formatPrice(price, currency)}{compareAtAmount && <del>{formatPrice(compareAtAmount, currency)}</del>}</p>
        {product.variants && product.variants.length > 1 && <label className="product-variant-picker">Style<select value={selectedVariant?.id ?? ""} onChange={(event) => setSelectedVariantId(event.target.value)}>{product.variants.map((variant) => <option key={variant.id} value={variant.id} disabled={variant.availability === "unavailable"}>{variant.title} · {formatPrice(variant.priceAmount, variant.currency)}</option>)}</select></label>}
        {product.size && <p className="product-size-pill">{product.size}</p>}
        {product.dispatchTime && <p className="product-dispatch">↗ {product.dispatchTime}</p>}
        <div className="product-quantity"><span>Quantity</span><div><button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((amount) => Math.max(1, amount - 1))}>−</button><span>{quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((amount) => amount + 1)}>＋</button></div></div>
        {comingSoon || soldOut ? <button className="shop-button product-add-button" type="button" disabled>{comingSoon ? "Coming soon" : "Sold out"}</button> : addButton}
        <p className="product-shipping-note">Shipping and taxes calculated at checkout.</p>
        <div className="product-trust"><span>♡ Thoughtfully selected</span><span>↗ Tracked delivery</span><span>✦ Ready to be loved</span></div>
      </div>
      <div className="mobile-sticky-purchase"><Link href="/" className="product-home-shortcut" aria-label="Home">⌂</Link><button type="button" className={`product-save${saved ? " is-saved" : ""}`} aria-label={`${saved ? "Remove from" : "Save to"} wishlist`} aria-pressed={saved} onClick={toggleWishlist}>{saved ? "♥" : "♡"}</button>{comingSoon || soldOut ? <button className="shop-button product-add-button" type="button" disabled>{comingSoon ? "Coming soon" : "Sold out"}</button> : addButton}</div>
      <div className="product-details-accordion">
        <details open><summary>Product details</summary><div><p>{product.description}</p><dl><div><dt>Brand</dt><dd>{product.supplierName}</dd></div><div><dt>Type</dt><dd>{product.productType ?? product.categoryName}</dd></div>{product.size && <div><dt>Size</dt><dd>{product.size}</dd></div>}{product.dimensions && <div><dt>Dimensions</dt><dd>{product.dimensions}</dd></div>}</dl></div></details>
        <details><summary>Materials &amp; Care</summary><p>Spot clean gently with a damp cloth and mild soap, then air dry. Brush fur softly to keep it fluffy.</p></details>
        <details><summary>How your order works</summary><p>Review your plush and order summary in the preview checkout. Shipping options and delivery estimates depend on your destination.</p></details>
      </div>
    </>
  );
}
