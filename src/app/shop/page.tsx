import { SiteFrame } from "@/components/layout/site-frame";
import { ProductGrid } from "@/components/product/product-grid";
import { getProducts } from "@/services/product.service";

const categoryAliases: Record<string, string> = {
  bears: "bears",
  bunnies: "bunnies",
  "giant-plush": "giant plush",
  cats: "cats",
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const [{ category }, products] = await Promise.all([searchParams, getProducts()]);
  const selectedCategory = category ? categoryAliases[category] ?? category : undefined;
  const visibleProducts = selectedCategory
    ? products.filter((product) => product.categoryName.toLowerCase() === selectedCategory)
    : products;

  return (
    <SiteFrame>
      <div className="page-intro">
        <p className="eyebrow">A small world of soft things</p>
        <h1 className="page-title">Temukan teman barumu.</h1>
        <p className="page-description">Koleksi plushie pilihan, dikurasi dengan hati. Ketersediaan dapat dikonfirmasi kepada supplier sebelum pesanan diproses.</p>
      </div>
      {category && <p className="status-chip">Kategori: {category.replaceAll("-", " ")} <a href="/shop"> · Hapus filter</a></p>}
      <ProductGrid products={visibleProducts} />
    </SiteFrame>
  );
}
