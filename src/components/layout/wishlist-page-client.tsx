"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import { useLocalization } from "@/components/layout/localization-provider";
import { readWishlist, saveWishlist, useWishlistHandles } from "@/lib/wishlist";
import { ApiRequestError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import type { Product } from "@/types/product";

export function WishlistPageClient({ products }: { products: Product[] }) {
  const { t } = useLocalization();
  const saved = useWishlistHandles();
  const [wishlistReady, setWishlistReady] = useState(!PONYO_API_BASE_URL);
  const [wishlistMessage, setWishlistMessage] = useState<"synced" | "sync_failed" | "check_failed" | "">("");
  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getWishlist().then(async ({ productSlugs }) => {
      if (!active) return;
      const merged = [...new Set([...productSlugs, ...readWishlist()])];
      if (merged.length !== productSlugs.length) {
        try {
          await ponyoApi.updateWishlist(merged);
          if (active) setWishlistMessage("synced");
        } catch {
          if (active) setWishlistMessage("sync_failed");
        }
      } else {
        setWishlistMessage("synced");
      }
      if (active) saveWishlist(merged);
    }).catch((error: unknown) => {
      if (!active) return;
      if (!(error instanceof ApiRequestError && error.status === 401)) {
        setWishlistMessage("check_failed");
      }
    }).finally(() => { if (active) setWishlistReady(true); });
    return () => { active = false; };
  }, []);
  const savedProducts = products.filter((product) => saved.includes(product.slug));
  const statusMessages = {
    synced: "Your favorites are saved to your Ponyo account.",
    sync_failed: "Some favorites couldn’t be synced. Try saving them again.",
    check_failed: "We couldn’t check your account favorites right now.",
  };
  return <>
    <header className="wishlist-studio-hero">
      <div className="wishlist-studio-intro">
        <p className="wishlist-studio-eyebrow"><span aria-hidden="true">✦</span> {t("wishlist.studio.eyebrow", "THE LITTLE THINGS YOU LOVE")}</p>
        <h1>{t("wishlist.studio.title", "My Wishlist")}<span aria-hidden="true">.</span></h1>
        <p className="wishlist-studio-lead">{t("wishlist.studio.subtitle", "A little collection of plush you can’t stop thinking about. Keep them close, until you’re ready.")}</p>
        <Link href="/shop" className="wishlist-studio-browse">{t("wishlist.studio.browse", "Discover more plush")} <span aria-hidden="true">↗</span></Link>
      </div>
      <div className="wishlist-studio-keepsake">
        <WishlistIllustration />
        <div className="wishlist-studio-counter"><span>{t("wishlist.studio.saved", "Saved favorites")}</span><strong>{String(savedProducts.length).padStart(2, "0")}</strong><span aria-hidden="true">♡</span></div>
      </div>
    </header>
    <section className="wishlist-studio-collection" aria-labelledby="wishlist-collection-heading" aria-busy={!wishlistReady}>
      <div className="wishlist-studio-toolbar">
        <div><p className="wishlist-studio-eyebrow">PONYO / {t("wishlist.studio.saved", "Saved favorites")}</p><h2 id="wishlist-collection-heading">{t("wishlist.studio.collection", "Your personal collection")}</h2><p>{t("wishlist.studio.collection_hint", "All your heart-picked favorites, together in one place.")}</p></div>
        <span className="wishlist-studio-count">{t("wishlist.studio.count", "{{ count }} saved", { count: savedProducts.length })}</span>
      </div>
      {wishlistMessage && <p className={`wishlist-studio-status${wishlistMessage !== "synced" ? " is-warning" : ""}`} role="status"><span aria-hidden="true">{wishlistMessage === "synced" ? "✓" : "!"}</span>{t(`wishlist.studio.${wishlistMessage}`, statusMessages[wishlistMessage])}</p>}
      {savedProducts.length ? <ProductGrid products={savedProducts} /> : <div className="wishlist-studio-empty">
        <div className="wishlist-studio-empty-art"><WishlistIllustration small /></div>
        <p className="wishlist-studio-eyebrow">{t("wishlist.studio.empty_note", "A small heart. The start of something lovely.")}</p>
        <h3>{wishlistReady ? t("wishlist.studio.empty_title", "Make room for a little love.") : t("wishlist.studio.checking", "Gathering your favorites…")}</h3>
        <p>{t("wishlist.studio.empty_body", "Found a plush that feels like you? Tap its heart and we’ll keep it here for your next visit.")}</p>
        <Link className="wishlist-studio-primary" href="/shop">{t("wishlist.studio.empty_cta", "Find your first favorite")}<span aria-hidden="true">→</span></Link>
        <Link className="wishlist-studio-secondary" href="/collections/rare-finds">{t("wishlist.studio.rare", "Explore Rare Finds")} <span aria-hidden="true">↗</span></Link>
      </div>}
      <p className="wishlist-studio-footer"><span aria-hidden="true">♡</span>{t("wishlist.studio.tip", "Love it now. Come back for it later.")}</p>
    </section>
  </>;
}

function WishlistIllustration({ small = false }: { small?: boolean }) {
  return <svg className={small ? "wishlist-studio-art is-small" : "wishlist-studio-art"} viewBox="0 0 360 270" fill="none" aria-hidden="true">
    <ellipse cx="181" cy="231" rx="115" ry="13" fill="#754930" opacity=".07" />
    <path d="M82 97c-24-51 8-88 47-68 23-45 83-27 79 15 68-14 102 49 67 86 43 57-10 114-64 91-25 34-82 24-89-11-55 12-84-50-47-81" fill="#F9DFC5" opacity=".65" />
    <g transform="rotate(-10 163 134)"><rect x="80" y="58" width="162" height="161" rx="13" fill="#EBC4A5" /><rect x="76" y="51" width="162" height="161" rx="13" fill="#FFFCF5" stroke="#E3C5AA" strokeWidth="1.5" /><path d="M94 61h126" stroke="#EAD8C6" strokeDasharray="3 5" />
      <path d="M157 175s-51-30-51-61c0-31 38-41 51-15 17-26 52-15 52 15 0 31-52 61-52 61Z" fill="#F08779" /><path d="M120 111c2-9 10-13 18-11" stroke="#FFD6C7" strokeWidth="6" strokeLinecap="round" /><path d="M123 193h67" stroke="#D7BC9F" strokeWidth="3" strokeLinecap="round" />
    </g>
    <g transform="rotate(12 252 175)"><rect x="213" y="132" width="76" height="85" rx="14" fill="#FFF2D9" stroke="#D9B58A" /><path d="M232 166c0-21 38-21 38 0v7h-38v-7Z" fill="#EDA655" /><path d="M237 177v11m9-11v16m9-16v12m9-12v15" stroke="#EDA655" strokeWidth="4" strokeLinecap="round" /><circle cx="245" cy="165" r="2" fill="#704B38" /><circle cx="258" cy="165" r="2" fill="#704B38" /></g>
    <path d="m274 54 3 10 10 3-10 3-3 10-3-10-10-3 10-3ZM58 161l2 7 8 2-8 3-2 7-2-7-8-3 8-2Z" fill="#D99A47" /><path d="m294 108 5-6m-2 17 8 1M63 74l-7-5" stroke="#BC7B55" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
