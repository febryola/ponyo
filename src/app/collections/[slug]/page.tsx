import { redirect } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { WishlistPageClient } from "@/components/layout/wishlist-page-client";
import { getLocalizedProducts } from "@/services/localized-products.server";
import ShopPage from "@/app/shop/page";

type Query = Record<string, string | string[] | undefined>;

export default async function CollectionAliasPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Query> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (query.view === "wishlist") {
    const products = await getLocalizedProducts();
    return <SiteFrame className="store-page"><div className="store-container wishlist-content"><p className="eyebrow">A PLACE FOR YOUR FAVORITES</p><h1>My Wishlist</h1><p className="page-lead">Keep your favorite plush finds close.</p><WishlistPageClient products={products} /></div></SiteFrame>;
  }
  if (slug === "frontpage" || slug === "collectibles") redirect("/collections");
  return ShopPage({ searchParams: Promise.resolve({ ...query, category: slug === "all" ? query.category : slug }) });
}
