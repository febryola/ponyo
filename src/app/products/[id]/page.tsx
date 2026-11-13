 import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { ProductPurchasePanel } from "@/components/product/product-purchase-panel";
import { ProductReviews, ProductWaitlistForm } from "@/components/product/product-community";
import { ProductPriceHistory } from "@/components/product/product-price-history";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductGallery } from "@/components/product/product-gallery";
import { withProductVariantDemo } from "@/lib/product-variant-demo";
import { getLocalizedProductById, getLocalizedProducts } from "@/services/localized-products.server";
import { selectRelatedProducts } from "@/lib/related-products";

const getProductPageData = cache(async (identifier: string) => {
  const products = await getLocalizedProducts("?limit=100");
  const product = products.find((item) => item.id === identifier)
    ?? products.find((item) => item.slug === identifier)
    ?? await getLocalizedProductById(identifier);
  return { product, products };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { product } = await getProductPageData(id);
  return product ? { title: `${product.name} – Ponyo`, description: product.description } : { title: "Plush not found" };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { product, products } = await getProductPageData(id);
  if (!product) notFound();
  if (product.id !== id) redirect(`/products/${encodeURIComponent(product.id)}`);
  const displayProduct = process.env.PONYO_VARIANT_DEMO === "true"
    ? withProductVariantDemo(product)
    : product;
  const selectedVariant = displayProduct.variants?.find((variant) => variant.id === displayProduct.variantId)
    ?? displayProduct.variants?.[0];
  const productImages = selectedVariant?.galleryImages?.length
    ? selectedVariant.galleryImages
    : displayProduct.galleryImages?.length
      ? displayProduct.galleryImages
      : [{ src: typeof displayProduct.image === "string" ? displayProduct.image : displayProduct.image.src, alt: displayProduct.imageAlt }];

  const related = selectRelatedProducts(products, product);
  const hasWaitlist = product.availability === "unavailable"
    || ["Coming Soon", "Waitlist", "Unavailable"].includes(product.availabilityStatus ?? "");

  return (
    <SiteFrame className="store-page product-page">
      <section className="product-detail-layout">
        <div className="product-gallery-column">
          <ProductGallery title={product.name} images={productImages} />
          <section className="product-brand-story" aria-labelledby="product-brand-story-title">
            <span className="product-brand-story-seal" aria-hidden="true">✦</span>
            <div className="product-brand-story-copy"><p className="eyebrow">PONYO MARKETPLACE · BRAND SPOTLIGHT</p><h2 id="product-brand-story-title">Meet {product.supplierName}</h2><p><strong>{product.supplierName}</strong> is the brand or maker behind {product.name}. Ponyo brings independent plush brands together in one carefully curated marketplace.</p><Link href="/pages/about">How Ponyo curates its marketplace <span aria-hidden="true">→</span></Link></div>
            <Link className="product-brand-story-link" href={`/shop?q=${encodeURIComponent(product.supplierName)}`}>More from this brand <span aria-hidden="true">→</span></Link>
          </section>
          <dl className="product-gallery-facts" aria-label="Product at a glance">
            {(product.dimensions || product.size || product.sizeTier) && <div><dt>SIZE</dt><dd>{product.dimensions ?? product.size ?? product.sizeTier}</dd></div>}
            <div><dt>COLLECTION</dt><dd>{product.categoryName}</dd></div>
            {product.color && <div><dt>COLOR</dt><dd>{product.color}</dd></div>}
            {product.dispatchTime && <div><dt>DISPATCH</dt><dd>{product.dispatchTime}</dd></div>}
          </dl>
          <ProductPriceHistory history={product.priceHistory ?? []} currency={product.currency} />
        </div>
        <div className="product-detail-copy"><ProductPurchasePanel product={displayProduct} /><p className="product-payment-caption">Secure checkout powered by Ponyo.</p>{hasWaitlist && <ProductWaitlistForm productId={product.id} productName={product.name} />}</div>
      </section>
      <ProductReviews productId={product.id} />
      {related.length > 0 && <section className="related-products store-container"><div className="section-head"><div><p className="eyebrow">A FEW MORE TO LOVE</p><h2>You may also like</h2></div><Link className="text-link" href={`/shop?category=${product.categoryName.toLowerCase().replaceAll(" ", "-")}`}>See all →</Link></div><ProductGrid products={related} /></section>}
    </SiteFrame>
  );
}