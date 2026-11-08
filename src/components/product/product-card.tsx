"use client";

import Image from "next/image";
import Link from "next/link";
import { saveWishlist, useWishlistHandles } from "@/lib/wishlist";
import { useLocalization } from "@/components/layout/localization-provider";
import type { Product } from "@/types/product";


export function ProductCard({ product, badge, compact = false }: { product: Product; badge?: string; compact?: boolean }) {
  const { formatPrice } = useLocalization();
  const savedHandles = useWishlistHandles();
  const isWishlisted = savedHandles.includes(product.slug);
  const tags = product.tags ?? [];
  const isNew = product.isNew ?? tags.includes("new-arrival");
  const isXl = tags.includes("domina-xl") || /\bxl\b/i.test(`${product.name} ${product.sizeTier ?? ""} ${product.size ?? ""}`);
  const categoryLabel = product.size ?? (product.productType === "Plush" ? product.categoryName : product.productType ?? product.categoryName);
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
    ...(isXl ? ["XL"] : []),
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
        <button type="button" className={`wishlist-toggle${isWishlisted ? " is-saved" : ""}`} aria-label={`${isWishlisted ? "Remove from" : "Save to"} wishlist: ${product.name}`} aria-pressed={isWishlisted} onClick={toggleWishlist}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5-8.8 11-8.8 11s-8.8-6-8.8-11A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 2.5Z" fill={isWishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="shop-product-info">
        <Link href={`/products/${product.slug}`} className="shop-product-title">{product.name}</Link>
        <div className="shop-product-meta"><span>{categoryLabel}</span></div>
        <div className="shop-product-bottom"><strong>{product.compareAtAmount && product.compareAtAmount > product.priceAmount ? <><span>{formatPrice(product.priceAmount, product.currency)}</span><del>{formatPrice(product.compareAtAmount, product.currency)}</del></> : formatPrice(product.priceAmount, product.currency)}</strong><Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`} className="product-card-arrow">→</Link></div>
        {product.dispatchTime && <p className="shop-product-dispatch">{product.dispatchTime}</p>}
      </div>
    </article>
  );
}
