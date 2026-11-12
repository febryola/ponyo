import { SiteFrame } from "@/components/layout/site-frame";
import { WishlistPageClient } from "@/components/layout/wishlist-page-client";
import { getLocalizedProducts } from "@/services/localized-products.server";
import "@/app/wishlist-studio.css";

export const metadata = { title: "My Wishlist" };

export default async function WishlistPage() {
  const products = await getLocalizedProducts();
  return <SiteFrame className="store-page wishlist-studio"><div className="store-container wishlist-content"><WishlistPageClient products={products} /></div></SiteFrame>;
}
