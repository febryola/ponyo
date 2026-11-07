import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { ProductPurchasePanel } from "@/components/product/product-purchase-panel";
import { ProductGrid } from "@/components/product/product-grid";
import { RecentlyViewedTracker } from "@/components/product/recently-viewed-tracker";
import { ProductGallery } from "@/components/product/product-gallery";
import { RecentlyViewed } from "@/components/home/recently-viewed";
import { getProductBySlug, getProducts } from "@/services/product.service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return product ? { title: `${product.name} – Ponyo`, description: product.description } : { title: "Plush not found" };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, products] = await Promise.all([getProductBySlug(slug), getProducts()]);
  if (!product) notFound();
  const related = products.filter((item) => item.slug !== product.slug && (item.categoryName === product.categoryName || item.tags?.some((tag) => product.tags?.includes(tag)))).slice(0, 4);

  return (
    <SiteFrame className="store-page product-page">
      <RecentlyViewedTracker slug={product.slug} />
      <nav className="store-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/shop">Shop</Link><span>/</span><span>{product.name}</span></nav>
      <section className="product-detail-layout">
        <ProductGallery title={product.name} images={product.galleryImages?.length ? product.galleryImages : [{ src: typeof product.image === "string" ? product.image : product.image.src, alt: product.imageAlt }]} />
        <div className="product-detail-copy"><ProductPurchasePanel product={product} /><p className="product-payment-caption">Secure checkout powered by Ponyo.</p></div>
      </section>
      {related.length > 0 && <section className="related-products store-container"><div className="section-head"><div><p className="eyebrow">A FEW MORE TO LOVE</p><h2>You may also like</h2></div><Link className="text-link" href={`/shop?category=${product.categoryName.toLowerCase().replaceAll(" ", "-")}`}>See all →</Link></div><ProductGrid products={related} /></section>}
      <RecentlyViewed products={products.filter((item) => item.slug !== product.slug)} />
    </SiteFrame>
  );
}
