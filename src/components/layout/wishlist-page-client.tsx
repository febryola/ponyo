"use client";

import { useEffect, useState } from "react";
import { ProductGrid } from "@/components/product/product-grid";
import { readWishlist, saveWishlist, useWishlistHandles } from "@/lib/wishlist";
import { ApiRequestError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import type { Product } from "@/types/product";

export function WishlistPageClient({ products }: { products: Product[] }) {
  const saved = useWishlistHandles();
  const [accountWishlist, setAccountWishlist] = useState(false);
  const [wishlistReady, setWishlistReady] = useState(!PONYO_API_BASE_URL);
  const [wishlistMessage, setWishlistMessage] = useState("");
  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getWishlist().then(async ({ productSlugs }) => {
      if (!active) return;
      setAccountWishlist(true);
      const merged = [...new Set([...productSlugs, ...readWishlist()])];
      if (merged.length !== productSlugs.length) {
        try {
          await ponyoApi.updateWishlist(merged);
          if (active) setWishlistMessage("Your favorites are saved to your Ponyo account.");
        } catch {
          if (active) setWishlistMessage("Some favorites couldn’t be synced. Try saving them again.");
        }
      } else {
        setWishlistMessage("Your favorites are saved to your Ponyo account.");
      }
      if (active) saveWishlist(merged);
    }).catch((error: unknown) => {
      if (!active) return;
      if (!(error instanceof ApiRequestError && error.status === 401)) {
        setWishlistMessage("We couldn’t check your account favorites right now.");
      }
    }).finally(() => { if (active) setWishlistReady(true); });
    return () => { active = false; };
  }, []);
  const savedProducts = products.filter((product) => saved.includes(product.slug));
  return <>
    {wishlistMessage && <p className="wishlist-account-note" role="status">{accountWishlist ? "🪼 " : ""}{wishlistMessage}</p>}
    {savedProducts.length ? <ProductGrid products={savedProducts} /> : <div className="empty-collection"><strong>{wishlistReady ? "Your wishlist is ready for its first plush." : "Checking your saved plushies…"}</strong><p>Tap the heart on any plush to save it here for later.</p><a className="shop-button shop-button-orange" href="/shop">Explore plush <b>→</b></a></div>}
  </>;
}
