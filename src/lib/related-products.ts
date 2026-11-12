import type { Product } from "@/types/product";

/** Prefer category/tag matches, then fill the six-card shelf with other products. */
export function selectRelatedProducts(products: Product[], product: Product): Product[] {
  const seen = new Set([product.id]);
  const candidates = products.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const isRelated = (item: Product) => item.categoryName === product.categoryName
    || Boolean(item.tags?.some((tag) => product.tags?.includes(tag)));

  return [...candidates.filter(isRelated), ...candidates.filter((item) => !isRelated(item))].slice(0, 6);
}