import ShopPage from "@/app/shop/page";

export default async function SearchAliasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return ShopPage({ searchParams });
}
