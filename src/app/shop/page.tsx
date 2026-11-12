import Image from "next/image";
import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";
import { ProductGrid } from "@/components/product/product-grid";
import { SortSelect } from "@/components/product/sort-select";
import { CatalogFilterPanel } from "@/components/product/catalog-filter-panel";
import { getLocalizedProducts } from "@/services/localized-products.server";

export const metadata = { title: "The Full Collection" };

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const collections = [
  { title: "Bears", slug: "bears" }, { title: "Bunnies", slug: "bunnies" },
  { title: "Cats", slug: "cats" }, { title: "Cute Characters", slug: "characters" },
  { title: "New Arrivals", slug: "new-arrivals" }, { title: "Pandas", slug: "pandas" },
  { title: "Penguins", slug: "penguins" }, { title: "Premium Plushies", slug: "premium" },
  { title: "Puppies", slug: "puppies" }, { title: "RARE Finds", slug: "rare-finds" },
  { title: "Trending", slug: "trending" }, { title: "XL Goodies", slug: "domina-xl" },
];
const trendingHandles = new Set(["cherry-blossom-bunny", "mint-dino", "hoshi-cloud-bear", "better-days-panda", "bluebell-penguin", "haneul-bunny", "cloud-cat", "biscuit-bow-pup"]);

function matchesCategory(tags: string[] = [], type = "", category = "", slug = "") {
  const key = category.toLowerCase().replaceAll("_", "-");
  if (key === "trending") return trendingHandles.has(slug);
  const aliases: Record<string, string> = {
    "rare-finds": "rare", rare: "rare", premium: "premium", "domina-xl": "domina-xl", "giant-plush": "domina-xl",
    "new-arrival": "new-arrival", "new-arrivals": "new-arrival", bears: "bear", bunnies: "bunny", cats: "cat",
    pandas: "panda", puppies: "puppy", penguins: "penguin", characters: "character", "cute-characters": "character",
    collectibles: "collectible",
  };
  if (!key || key === "all") return true;
  const tag = aliases[key] ?? key;
  return tags.some((item) => item.toLowerCase() === tag) || type.toLowerCase() === tag;
}

function headingFor(category: string, search: string) {
  if (search) return `Search results for “${search}”`;
  const names: Record<string, string> = {
    "": "The Full Collection ✧", all: "The Full Collection ✧", "rare-finds": "RARE Finds", premium: "Premium Plushies",
    "domina-xl": "XL Goodies", "giant-plush": "XL Goodies", "new-arrival": "New Arrivals", "new-arrivals": "New Arrivals",
    bears: "Bears", bunnies: "Bunnies", cats: "Cats", characters: "Cute Characters", pandas: "Pandas", penguins: "Penguins",
    puppies: "Puppies", trending: "Trending",
  };
  return names[category] ?? category.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function collectionImage(category: string) {
  if (["rare-finds", "rare"].includes(category)) return "/images/catalog/maker-penguin.jpg";
  if (["domina-xl", "giant-plush"].includes(category)) return "/images/catalog/ponyo-3.png";
  if (["new-arrivals", "new-arrival"].includes(category)) return "/images/catalog/ponyo-6.png";
  if (category === "premium") return "/images/catalog/ponyo-5.png";
  if (["collectibles", "characters"].includes(category)) return "/images/catalog/ponyo-7.png";
  return "/images/catalog/ponyo-2.png";
}

function collectionDescription(category: string) {
  if (category === "premium") return "Premium plush made with the finest materials and stitching.";
  return "Browse plush by type, size, and price. Product and delivery details are shown on each listing.";
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const category = first(query.category) ?? first(query.collection) ?? "";
  const search = (first(query.q) ?? "").trim();
  const minimum = Number(first(query.min) ?? first(query["filter.v.price.gte"]) ?? 0);
  const maximum = Number(first(query.max) ?? first(query["filter.v.price.lte"]) ?? Number.POSITIVE_INFINITY);
  const size = first(query.size) ?? first(query["filter.p.m.ponyo.size_tier"]) ?? "";
  const availability = first(query["filter.v.availability"]) ?? "";
  const sort = first(query.sort_by) ?? "best-selling";
  const products = await getLocalizedProducts();
  const filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.description} ${product.productType ?? ""} ${(product.tags ?? []).join(" ")}`.toLowerCase();
    const productSize = (product.sizeTier ?? product.size ?? "").toLowerCase();
    const sizeMatches = !size || (size.toLowerCase() === "xl" ? product.tags?.includes("domina-xl") : productSize.startsWith(size.toLowerCase()));
    return matchesCategory(product.tags, product.productType, category, product.slug)
      && (!search || haystack.includes(search.toLowerCase()))
      && product.priceAmount >= minimum && product.priceAmount <= maximum
      && sizeMatches && (!availability || availability !== "1" || product.availability === "available");
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "featured" || sort === "best-selling") {
      const rank = (product: typeof a) => trendingHandles.has(product.slug) ? 0 : product.tags?.includes("new-arrival") ? 1 : 2;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    }
    if (sort === "relevance" && search) {
      const rank = (product: typeof a) => product.name.toLowerCase().startsWith(search.toLowerCase()) ? 0 : product.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 2;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    }
    if (sort === "price-ascending") return a.priceAmount - b.priceAmount;
    if (sort === "price-descending") return b.priceAmount - a.priceAmount;
    if (sort === "title-descending") return b.name.localeCompare(a.name);
    if (sort === "created-descending") return Number((b.tags ?? []).includes("new-arrival")) - Number((a.tags ?? []).includes("new-arrival"));
    if (sort === "created-ascending") return Number((a.tags ?? []).includes("new-arrival")) - Number((b.tags ?? []).includes("new-arrival"));
    return a.name.localeCompare(b.name);
  });
  const heading = headingFor(category, search);
  const badges = Object.fromEntries(products.map((product) => [product.slug,
    product.tags?.includes("rare") ? "Rare" : product.tags?.includes("premium") ? "Premium" : product.tags?.includes("new-arrival") ? "New" : "",
  ]).filter((entry) => entry[1]));
  const filterUrl = (removedKeys: string[] = []) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (removedKeys.includes(key) || key === "page") continue;
      const entry = first(value);
      if (entry !== undefined) params.set(key, entry);
    }
    const suffix = params.toString();
    return `/collections/all${suffix ? `?${suffix}` : ""}`;
  };
  const clearFiltersUrl = filterUrl(["size", "filter.p.m.ponyo.size_tier", "filter.v.availability", "min", "max", "filter.v.price.gte", "filter.v.price.lte"]);
  const preservedQuery = Object.fromEntries(Object.entries(query).flatMap(([key, value]) => {
    if (["category", "collection", "size", "filter.p.m.ponyo.size_tier", "filter.v.availability", "min", "max", "filter.v.price.gte", "filter.v.price.lte", "sort_by", "page"].includes(key)) return [];
    const entry = first(value);
    return entry === undefined ? [] : [[key, entry]];
  }));
  const activeFilters = [
    ...(size ? [{ label: `Size: ${size}`, remove: filterUrl(["size", "filter.p.m.ponyo.size_tier"]) }] : []),
    ...(availability ? [{ label: "In stock", remove: filterUrl(["filter.v.availability"]) }] : []),
    ...(minimum ? [{ label: `From ¥${minimum.toLocaleString("en-US")}`, remove: filterUrl(["min", "filter.v.price.gte"]) }] : []),
    ...(Number.isFinite(maximum) ? [{ label: `Up to ¥${maximum.toLocaleString("en-US")}`, remove: filterUrl(["max", "filter.v.price.lte"]) }] : []),
  ];

  return (
    <SiteFrame className="store-page collection-page">
      <header className={`collection-heading collection-tone-${category || "all"}`}>
        <div className="collection-heading-copy"><h1>{heading}</h1>
          <p>{collectionDescription(category)}</p>
          <div className="collection-size-chips"><span>{sorted.length} plush</span>{["Small", "Medium", "Large", "XL"].map((tier) => <Link key={tier} href={`/shop?${new URLSearchParams({ ...(category ? { category } : {}), size: tier }).toString()}`} className={size === tier ? "is-selected" : ""}>{tier}</Link>)}</div>
        </div><div className="collection-heading-image"><Image src={collectionImage(category)} alt="" fill sizes="(max-width: 700px) 100vw, 45vw" priority /></div>
      </header>
      <nav className="collection-mobile-chips" aria-label="Categories"><Link href="/collections/all" aria-current={!category ? "page" : undefined}>All plush</Link>{collections.map((item) => <Link key={item.slug} href={`/collections/${item.slug}`} aria-current={category === item.slug ? "page" : undefined}>{item.title}<small>{products.filter((product) => matchesCategory(product.tags, product.productType, item.slug, product.slug)).length}</small></Link>)}</nav>
      <div className="collection-layout">
        <aside className="collection-sidebar">
          <h2>Category</h2>
          <nav aria-label="Product categories">
            <Link href="/collections/all" className={!category ? "is-selected" : ""}><span>All plush</span><b>{products.length}</b></Link>
            {collections.map((item) => {
              const count = products.filter((product) => matchesCategory(product.tags, product.productType, item.slug, product.slug)).length;
              return <Link key={item.slug} href={`/collections/${item.slug}`} className={category === item.slug ? "is-selected" : ""}><span>{item.title}</span><b>{count}</b></Link>;
            })}
          </nav>
          <details className="sidebar-filter" open><summary>Availability</summary><Link href={`/shop?${new URLSearchParams({ ...(category ? { category } : {}), ...(size ? { size } : {}), ...(minimum ? { min: String(minimum) } : {}), ...(Number.isFinite(maximum) ? { max: String(maximum) } : {}), ...(sort !== "best-selling" ? { sort_by: sort } : {}), "filter.v.availability": "1" }).toString()}`} className={availability === "1" ? "is-selected" : ""}>In stock <b>{products.filter((product) => product.availability === "available").length}</b></Link></details>
          <details className="sidebar-filter" open><summary>Price</summary><form action="/shop" method="get">{category && <input type="hidden" name="category" value={category} />}{search && <input type="hidden" name="q" value={search} />}{size && <input type="hidden" name="size" value={size} />}{availability && <input type="hidden" name="filter.v.availability" value={availability} />}{sort !== "best-selling" && <input type="hidden" name="sort_by" value={sort} />}<label>¥ <input type="number" name="min" min="0" defaultValue={minimum || ""} placeholder="From" /></label><span>to</span><label>¥ <input type="number" name="max" min="0" defaultValue={Number.isFinite(maximum) ? maximum : ""} placeholder="To" /></label><button type="submit" aria-label="Apply price range">›</button></form></details>
        </aside>
        <section className="collection-products" aria-label="Products">
          <div className="collection-toolbar">
            <CatalogFilterPanel categories={collections} category={category} size={size} minimum={minimum} maximum={maximum} availability={availability} preservedQuery={preservedQuery} clearHref={clearFiltersUrl} />
            <span className="collection-count">{sorted.length} products</span>
            <SortSelect value={sort} category={category} search={search} preservedFilters={{ ...(minimum ? { min: String(minimum) } : {}), ...(Number.isFinite(maximum) ? { max: String(maximum) } : {}), ...(size ? { size } : {}), ...(availability ? { "filter.v.availability": availability } : {}) }} />
          </div>
          {activeFilters.length > 0 && <div className="active-filter-chips" aria-label="Active filters">{activeFilters.map((filter) => <Link href={filter.remove} key={filter.label} aria-label={`Remove filter: ${filter.label}`}>{filter.label}<span aria-hidden="true">×</span></Link>)}<Link href={clearFiltersUrl} className="clear-all-filters">Clear all</Link></div>}
          <p className="mobile-product-count">{sorted.length} products</p>
          <ProductGrid products={sorted} badges={badges} fillSlots />
          {sorted.length === 0 && <div className="empty-collection"><strong>No plush found just yet.</strong><p>Try a different search or clear your filters.</p><Link className="shop-button shop-button-orange" href="/shop">See all plush</Link></div>}
        </section>
      </div>
    </SiteFrame>
  );
}
