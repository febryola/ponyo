"use client";

import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import { useLocalization } from "@/components/layout/localization-provider";
import type { Product } from "@/types/product";

type ProductShelfProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  products: Product[];
  href?: string;
  linkLabel?: string;
  className?: string;
  badges?: Record<string, string>;
  rail?: boolean;
  compact?: boolean;
  id?: string;
};

export function ProductShelf({
  eyebrow,
  title,
  description,
  products,
  href = "/shop",
  linkLabel = "Shop all →",
  className = "",
  badges,
  rail = false,
  compact = false,
  id,
}: ProductShelfProps) {
  const { t } = useLocalization();
  const localeKeys = id === "new-arrivals"
    ? { title: "home.v2.new_title", description: "home.v2.new_sub" }
    : id === "more-plush"
      ? { title: "home.more_plush.title", description: "home.more_plush.sub" }
      : id === "domina-products"
        ? { title: "home.domina_shelf.title", eyebrow: "home.domina_shelf.eyebrow" }
        : id === "most-loved"
          ? { title: "home.most_loved.title", description: "home.most_loved.sub" }
          : null;
  const localizedTitle = localeKeys ? t(localeKeys.title, title) : title;
  const localizedDescription = description ? t(localeKeys?.description ?? "", description) : description;
  const localizedEyebrow = eyebrow ? t(localeKeys?.eyebrow ?? "", eyebrow) : eyebrow;
  return (
    <section id={id} className={`home-product-shelf container ${className}`.trim()}>
      <div className="section-head">
        <div>
          {localizedEyebrow && <p className="eyebrow">{localizedEyebrow}</p>}
          <h2 className="section-title">{localizedTitle}</h2>
          {localizedDescription && <p className="section-sub">{localizedDescription}</p>}
        </div>
        <Link className="view-all" href={href}>{linkLabel}</Link>
      </div>
      <ProductGrid products={products} badges={badges} rail={rail} compact={compact} />
    </section>
  );
}
