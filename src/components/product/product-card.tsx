"use client";

import Image from "next/image";
import Link from "next/link";
import { saveWishlist, useWishlistHandles } from "@/lib/wishlist";
import { useLocalization } from "@/components/layout/localization-provider";
import type { Product } from "@/types/product";


export function ProductCard({ product, badge, compact = false }: { product: Product; badge?: string; compact?: boolean }) {
  const { formatPrice, t } = useLocalization();
  const productName = t(`product.names.${product.slug}`, product.name);
  const savedHandles = useWishlistHandles();
  const isWishlisted = savedHandles.includes(product.slug);
  const tags = product.tags ?? [];
  const isNew = product.isNew ?? tags.includes("new-arrival");
  const isXl = tags.includes("domina-xl") || /\bxl\b/i.test(`${product.name} ${product.sizeTier ?? ""} ${product.size ?? ""}`);
  const categoryLabel = product.size ?? t(`product.categories.${(product.productType === "Plush" ? product.categoryName : product.productType ?? product.categoryName).toLowerCase().replaceAll(" ", "_")}`, product.productType === "Plush" ? product.categoryName : product.productType ?? product.categoryName);
  const discountPercent = product.compareAtAmount && product.compareAtAmount > product.priceAmount
    ? Math.round((product.compareAtAmount - product.priceAmount) / product.compareAtAmount * 100)
    : 0;
  const statusLabel = product.availabilityStatus === "Coming Soon"
    ? t("product.status.coming_soon", "Coming soon")
    : product.availabilityStatus === "Waitlist"
      ? t("product.status.waitlist", "Join waitlist")
      : product.availabilityStatus === "Unavailable" || product.availability === "unavailable"
        ? t("product.status.unavailable", "Currently unavailable")
        : product.availabilityStatus === "Available" || product.availability === "available"
          ? t("product.status.available", "Available to order")
        : "";

  function toggleWishlist() {
    const next = isWishlisted ? savedHandles.filter((slug) => slug !== product.slug) : [product.slug, ...savedHandles];
    saveWishlist(next);
  }

  const labels = [...new Set([
    ...(badge ? [badge] : []),
    ...(statusLabel ? [statusLabel] : []),
    ...(isNew ? [t("product.label.new", "New")] : []),
    ...(discountPercent ? [t("product.label.save", `Save ${discountPercent}%`, { percent: discountPercent })] : []),
    ...(tags.includes("premium") ? [t("product.label.premium", "Premium")] : []),
    ...(tags.includes("rare") ? [t("product.label.rare", "Rare")] : []),
    ...(isXl ? [t("product.label.xl", "XL")] : []),
  ])];

  return (
    <article className={`shop-product-card${compact ? " is-compact" : ""}`}>
      <div className="shop-product-image">
        <Link href={`/products/${product.id}`} aria-label={t("product.action.view", `View ${productName}`, { title: productName })}>
          <Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 600px) 46vw, (max-width: 1000px) 30vw, 23vw" />
        </Link>
        <div className="product-labels">
          {labels.map((label) => <span key={label} className={`product-label ${label.toLowerCase().replaceAll(" ", "-")}${label === statusLabel ? " product-label--availability" : ""}`}>{label}</span>)}
        </div>
        <button type="button" className={`wishlist-toggle${isWishlisted ? " is-saved" : ""}`} aria-label={`${isWishlisted ? "Remove from" : "Save to"} wishlist: ${product.name}`} aria-pressed={isWishlisted} onClick={toggleWishlist}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5-8.8 11-8.8 11s-8.8-6-8.8-11A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 2.5Z" fill={isWishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="shop-product-info">
        <Link href={`/products/${product.id}`} className="shop-product-title">{productName}</Link>
        <div className="shop-product-meta"><span>{categoryLabel}</span></div>
        {statusLabel && <p className="shop-product-availability">{statusLabel}</p>}
        <div className="shop-product-bottom"><strong>{product.compareAtAmount && product.compareAtAmount > product.priceAmount ? <><span>{formatPrice(product.priceAmount, product.currency)}</span><del>{formatPrice(product.compareAtAmount, product.currency)}</del></> : formatPrice(product.priceAmount, product.currency)}</strong><Link href={`/products/${product.id}`} aria-label={`View ${product.name}`} className="product-card-arrow">→</Link></div>
        {product.dispatchTime && <p className="shop-product-dispatch">{product.dispatchTime}</p>}
      </div>
    </article>
  );
}
