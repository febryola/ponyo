"use client";

import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/product-card";
import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";

type ProductGridProps = {
  products: Product[];
  badges?: Record<string, string>;
  rail?: boolean;
  compact?: boolean;
  fillSlots?: boolean;
  fillColumns?: number[];
  promoOffset?: number;
  promoCount?: number;
};

const collectionPromos = [
  { key: "drops", href: "/#drops", titleKey: "fill.drops_title", bodyKey: "fill.drops_body", actionKey: "fill.drops_cta", title: "Rare drop alerts", body: "Be first to know when rare plush lands.", action: "Get alerts" },
  { key: "domina", href: "/pages/domina-xl", titleKey: "fill.domina_title", bodyKey: "fill.domina_body", actionKey: "fill.domina_cta", title: "Think bigger", body: "Giant plush up to 120 cm from Domina XL.", action: "Shop XL Goodies" },
  { key: "all", href: "/collections/all", titleKey: "fill.all_title", bodyKey: "fill.all_body", actionKey: "fill.all_cta", title: "More to discover", body: "Browse every plush in the marketplace.", action: "Shop all plush" },
  { key: "request", href: "/pages/contact", titleKey: "fill.request_title", bodyKey: "fill.request_body", actionKey: "fill.request_cta", title: "Can't find it?", body: "Tell us the plush you're hunting for and we'll look for it.", action: "Request a plush" },
  { key: "rare", href: "/collections/rare-finds", titleKey: "fill.rare_title", bodyKey: "fill.rare_body", actionKey: "fill.rare_cta", title: "Rare Finds", body: "Hard-to-find and limited-edition plush.", action: "Explore rare" },
];

export function ProductGrid({ products, badges, rail = false, compact = false, fillSlots = false, fillColumns = [2, 3, 4, 5], promoOffset = 0, promoCount = collectionPromos.length }: ProductGridProps) {
  const { t } = useLocalization();
  if (products.length === 0 && !fillSlots) {
    return <p className="empty-state">Belum ada produk yang ditampilkan. Coba kembali sebentar lagi.</p>;
  }

  const fillCounts = products.length === 0
    ? [4, 4, 4, 4]
    : fillColumns.map((columns) => (columns - products.length % columns) % columns);
  const fillCount = fillSlots ? Math.min(promoCount, collectionPromos.length, Math.max(...fillCounts)) : 0;
  const orderedPromos = [...collectionPromos.slice(promoOffset), ...collectionPromos.slice(0, promoOffset)];

  return (
    <div className={`product-grid${rail ? " marketplace-rail" : ""}`}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} badge={badges?.[product.slug]} compact={compact} />
      ))}
      {orderedPromos.slice(0, fillCount).map((promo, index) => (
        <Link
          key={promo.key}
          href={promo.href}
          className={`catalog-promo-tile catalog-promo-${promo.key}`}
          data-show-small={index < fillCounts[0]}
          data-show-medium={index < fillCounts[1]}
          data-show-large={index < fillCounts[2]}
          data-show-xlarge={index < fillCounts[3]}
        >
          <span className="catalog-promo-copy">
            <span className="catalog-promo-eyebrow">Ponyo</span>
            <strong>{t(promo.titleKey, promo.title)}</strong>
            <span className="catalog-promo-description">{t(promo.bodyKey, promo.body)}</span>
          </span>
          <span className="catalog-promo-action">{t(promo.actionKey, promo.action)} <span aria-hidden="true">→</span></span>
          <svg className="catalog-promo-mark" viewBox="0 0 64 64" aria-hidden="true"><path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z" fill="currentColor"/><path d="M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
        </Link>
      ))}
    </div>
  );
}
