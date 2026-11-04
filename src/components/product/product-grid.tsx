import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/product-card";

type ProductGridProps = {
  products: Product[];
  badges?: Record<string, string>;
  rail?: boolean;
  compact?: boolean;
};

export function ProductGrid({ products, badges, rail = false, compact = false }: ProductGridProps) {
  if (products.length === 0) {
    return <p className="empty-state">Belum ada produk yang ditampilkan. Coba kembali sebentar lagi.</p>;
  }

  return (
    <div className={`product-grid${rail ? " marketplace-rail" : ""}`}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} badge={badges?.[product.slug]} compact={compact} />
      ))}
    </div>
  );
}
