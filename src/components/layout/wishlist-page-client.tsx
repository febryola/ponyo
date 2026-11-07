"use client";

import { ProductGrid } from "@/components/product/product-grid";
import { useWishlistHandles } from "@/lib/wishlist";
import type { Product } from "@/types/product";

export function WishlistPageClient({ products }: { products: Product[] }) {
  const saved = useWishlistHandles();
  const savedProducts = products.filter((product) => saved.includes(product.slug));
  return savedProducts.length ? <ProductGrid products={savedProducts} /> : <div className="empty-collection"><strong>Your wishlist is ready for its first plush.</strong><p>Tap the heart on any plush to save it here for later.</p><a className="shop-button shop-button-orange" href="/shop">Explore plush <b>→</b></a></div>;
}
