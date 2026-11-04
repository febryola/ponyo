import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
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
  return (
    <section id={id} className={`home-product-shelf container ${className}`.trim()}>
      <div className="section-head">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="section-title">{title}</h2>
          {description && <p className="section-sub">{description}</p>}
        </div>
        <Link className="view-all" href={href}>{linkLabel}</Link>
      </div>
      <ProductGrid products={products} badges={badges} rail={rail} compact={compact} />
    </section>
  );
}
