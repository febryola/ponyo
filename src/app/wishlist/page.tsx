import { SiteFrame } from "@/components/layout/site-frame";
import { WishlistPageClient } from "@/components/layout/wishlist-page-client";
import { getLocalizedProducts } from "@/services/localized-products.server";

export const metadata = { title: "My Wishlist" };

export default async function WishlistPage() {
  const products = await getLocalizedProducts();
  return <SiteFrame className="store-page"><div className="store-container wishlist-content"><p className="eyebrow">A PLACE FOR YOUR FAVORITES</p><h1>My Wishlist</h1><p className="page-lead">Keep your favorite plush finds close.</p><WishlistPageClient products={products} /></div></SiteFrame>;
}
