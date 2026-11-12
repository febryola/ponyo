import { redirect } from "next/navigation";
import WishlistPage from "@/app/wishlist/page";
import ShopPage from "@/app/shop/page";

type Query = Record<string, string | string[] | undefined>;

export default async function CollectionAliasPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Query> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (query.view === "wishlist") {
    return WishlistPage();
  }
  if (slug === "frontpage" || slug === "collectibles") redirect("/collections");
  return ShopPage({ searchParams: Promise.resolve({ ...query, category: slug === "all" ? query.category : slug }) });
}
