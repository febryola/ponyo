"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import type { Product } from "@/types/product";

const recentlyViewedKey = "ponyo:recent";

export function RecentlyViewed({ products }: { products: Product[] }) {
  const serialized = useSyncExternalStore(
    (callback) => {
      window.addEventListener("ponyo:recently-viewed", callback);
      window.addEventListener("storage", callback);
      return () => {
        window.removeEventListener("ponyo:recently-viewed", callback);
        window.removeEventListener("storage", callback);
      };
    },
    () => { try { return localStorage.getItem(recentlyViewedKey) ?? "[]"; } catch { return "[]"; } },
    () => "[]",
  );
  let slugs: string[] = [];
  try { slugs = JSON.parse(serialized) as string[]; } catch { slugs = []; }

  const items = slugs.map((slug) => products.find((product) => product.slug === slug)).filter((product): product is Product => Boolean(product)).slice(0, 4);
  if (items.length === 0) return null;

  return <section className="recently-viewed store-container"><div><h2>Recently viewed</h2><Link href="/collections/all?view=wishlist" className="text-link">♡ My Wishlist</Link></div><ProductGrid products={items} compact /></section>;
}
