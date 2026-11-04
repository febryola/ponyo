"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatPrice } from "@/lib/utils/format-price";
import type { Product } from "@/types/product";

type ProductCardProps = {
  product: Product;
  badge?: string;
  compact?: boolean;
};

const sizeLabels: Record<string, string> = {
  "hoshi-cloud-bear": "Soft bear",
  "haneul-bunny": "Bunny favorite",
  "mint-dino": "Character plush",
  "bluebell-penguin": "Character plush",
  "good-things-ahead-kitty": "Cat plush",
  "better-days-panda": "Panda plush",
  "biscuit-bow-pup": "Puppy plush",
  "cloud-cat": "Cat plush",
  "sunny-chick": "Character plush",
  "cherry-blossom-bunny": "Bunny plush",
};

export function ProductCard({ product, badge, compact = false }: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const imageSrc = typeof product.image === "string" ? product.image : product.image.src;
  const size = product.size ?? sizeLabels[product.slug] ?? product.name.match(/\d+\s?cm/i)?.[0] ?? "XL plush";

  function addToBag() {
    window.dispatchEvent(new CustomEvent("ponyo:add-to-cart", {
      detail: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        maker: product.supplierName,
        price: product.priceAmount,
        currency: product.currency,
        image: imageSrc,
        imageAlt: product.imageAlt,
      },
    }));
  }

  return (
    <article className="product-card">
      <div className={`ph-thumb ${product.artTone ? `ph-${product.artTone}` : ""}`}>
        <Link href={`/products/${product.slug}`} className="wishlist-thumb-link" aria-label={`View ${product.name}`}>
          <Image className="product-photo" src={product.image} alt={product.imageAlt} fill sizes="(max-width: 560px) 72vw, (max-width: 1080px) 45vw, 25vw" />
        </Link>
        {badge && <span className={`badge ${badge === "New" ? "badge-new" : badge === "Limited" ? "badge-limited" : badge === "Loved" ? "badge-popular" : "badge-best"}`}>{badge}</span>}
        {!compact && (
          <button
            type="button"
            className={`wish-btn${isWishlisted ? " is-active" : ""}`}
            aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={isWishlisted}
            onClick={() => setIsWishlisted((value) => !value)}
          >
            {isWishlisted ? "♥" : "♡"}
          </button>
        )}
      </div>
      {!compact && <p className="product-maker">{product.supplierName}</p>}
      <Link href={`/products/${product.slug}`} className="product-name-link">
        <h3 className="product-name">{product.name}</h3>
      </Link>
      <p className="product-size">{size}</p>
      {!compact && <p className="product-reason">{product.description}</p>}
      <div className="product-row">
        <span className="price">{formatPrice(product.priceAmount, product.currency)}</span>
        {compact ? (
          <Link className="card-arrow" href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>→</Link>
        ) : (
          <button type="button" className="cart-btn" aria-label={`Add ${product.name} to cart`} onClick={addToBag}>🛒</button>
        )}
      </div>
    </article>
  );
}
