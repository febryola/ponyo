"use client";

import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/utils/format-price";
import { saveWishlist, useWishlistHandles } from "@/lib/wishlist";
import type { Product } from "@/types/product";


export function ProductCard({ product, badge, compact = false }: { product: Product; badge?: string; compact?: boolean }) {
  const savedHandles = useWishlistHandles();
  const isWishlisted = savedHandles.includes(product.slug);
  const tags = product.tags ?? [];
  const isNew = product.isNew ?? tags.includes("new-arrival");
  const discountPercent = product.compareAtAmount && product.compareAtAmount > product.priceAmount
    ? Math.round((product.compareAtAmount - product.priceAmount) / product.compareAtAmount * 100)
    : 0;

  function toggleWishlist() {
    const next = isWishlisted ? savedHandles.filter((slug) => slug !== product.slug) : [product.slug, ...savedHandles];
    saveWishlist(next);
  }

  const labels = [...new Set([
    ...(badge ? [badge] : []),
    ...(!product.availability || product.availability === "unavailable" ? ["Sold out"] : []),
    ...(isNew ? ["New"] : []),
    ...(product.availabilityStatus === "Limited" ? ["Limited"] : []),
    ...(discountPercent ? [`Save ${discountPercent}%`] : []),
    ...(tags.includes("premium") ? ["Premium"] : []),
    ...(tags.includes("rare") ? ["Rare"] : []),
  ])];

  return (
    <article className={`shop-product-card${compact ? " is-compact" : ""}`}>
      <div className="shop-product-image">
        <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
          <Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 600px) 46vw, (max-width: 1000px) 30vw, 23vw" />
        </Link>
        <div className="product-labels">
          {labels.map((label) => <span key={label} className={`product-label ${label.toLowerCase().replaceAll(" ", "-")}`}>{label}</span>)}
        </div>
        <button type="button" className={`wishlist-toggle${isWishlisted ? " is-saved" : ""}`} aria-label={`${isWishlisted ? "Remove from" : "Save to"} wishlist: ${product.name}`} aria-pressed={isWishlisted} onClick={toggleWishlist}>{isWishlisted ? "♥" : "♡"}</button>
      </div>
      <div className="shop-product-info">
        <div className="shop-product-meta"><span>{product.size ?? product.productType ?? product.categoryName}</span></div>
        <Link href={`/products/${product.slug}`} className="shop-product-title">{product.name}</Link>
        <div className="shop-product-bottom"><strong>{product.compareAtAmount && product.compareAtAmount > product.priceAmount ? <><span>{formatPrice(product.priceAmount, product.currency)}</span><del>{formatPrice(product.compareAtAmount, product.currency)}</del></> : formatPrice(product.priceAmount, product.currency)}</strong><Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`} className="product-card-arrow">→</Link></div>
        {product.dispatchTime && <p className="shop-product-dispatch">{product.dispatchTime}</p>}
      </div>
    </article>
  );
}
