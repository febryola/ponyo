import type { Product } from "@/types/product";

/** Variants of a product must not take up multiple editorial preview slots. */
export function uniqueProducts(products: Product[]) {
  const ids = new Set<string>();
  const slugs = new Set<string>();
  return products.filter((product) => {
    if (ids.has(product.id) || (product.slug && slugs.has(product.slug))) return false;
    ids.add(product.id);
    if (product.slug) slugs.add(product.slug);
    return true;
  });
}