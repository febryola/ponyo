import Image from "next/image";
import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";
import { ProductGrid } from "@/components/product/product-grid";
import { SortSelect } from "@/components/product/sort-select";
import { getProducts } from "@/services/product.service";

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
  const products = await getProducts();
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
    if (sort === "price-ascending") return a.priceAmount - b.priceAmount;
    if (sort === "price-descending") return b.priceAmount - a.priceAmount;
    if (sort === "title-descending") return b.name.localeCompare(a.name);
    if (sort === "created-descending" || sort === "best-selling") return Number((b.tags ?? []).includes("new-arrival")) - Number((a.tags ?? []).includes("new-arrival"));
    if (sort === "created-ascending") return Number((a.tags ?? []).includes("new-arrival")) - Number((b.tags ?? []).includes("new-arrival"));
    return a.name.localeCompare(b.name);
  });
  const heading = headingFor(category, search);
  const badges = Object.fromEntries(products.map((product) => [product.slug,
    product.tags?.includes("rare") ? "Rare" : product.tags?.includes("premium") ? "Premium" : product.tags?.includes("new-arrival") ? "New" : "",
  ]).filter((entry) => entry[1]));
  const activeFilters = [
    ...(size ? [{ label: `Size: ${size}`, remove: `/shop?${new URLSearchParams({ ...(category ? { category } : {}) }).toString()}` }] : []),
    ...(availability ? [{ label: "In stock", remove: `/shop?${new URLSearchParams({ ...(category ? { category } : {}), ...(size ? { size } : {}) }).toString()}` }] : []),
    ...(minimum ? [{ label: `From ¥${minimum.toLocaleString("en-US")}`, remove: "/shop" }] : []),
    ...(Number.isFinite(maximum) ? [{ label: `Up to ¥${maximum.toLocaleString("en-US")}`, remove: "/shop" }] : []),
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
          <details className="sidebar-filter" open><summary>Availability</summary><Link href={`/shop?${new URLSearchParams({ ...(category ? { category } : {}), "filter.v.availability": "1" }).toString()}`} className={availability === "1" ? "is-selected" : ""}>In stock <b>{products.filter((product) => product.availability === "available").length}</b></Link></details>
          <details className="sidebar-filter" open><summary>Price</summary><form action="/shop" method="get">{category && <input type="hidden" name="category" value={category} />}<label>¥ <input type="number" name="min" min="0" defaultValue={minimum || ""} placeholder="From" /></label><span>to</span><label>¥ <input type="number" name="max" min="0" defaultValue={Number.isFinite(maximum) ? maximum : ""} placeholder="To" /></label><button type="submit" aria-label="Apply price range">›</button></form></details>
        </aside>
        <section className="collection-products" aria-label="Products">
          <div className="collection-toolbar">
            <details className="all-filters"><summary><span aria-hidden="true">☷</span> All filters <b>⌄</b></summary><div className="all-filters-panel"><h2>Filters</h2><p>Category</p><div className="filter-chip-wrap">{collections.map((item) => <Link key={item.slug} href={`/shop?category=${item.slug}`} className={category === item.slug ? "is-selected" : ""}>{item.title}</Link>)}</div><p>Size</p><div className="filter-chip-wrap">{["Small", "Medium", "Large", "XL"].map((tier) => <Link key={tier} href={`/shop?${new URLSearchParams({ ...(category ? { category } : {}), size: tier }).toString()}`} className={size === tier ? "is-selected" : ""}>{tier}</Link>)}</div><p>Availability</p><Link className={availability === "1" ? "is-selected" : ""} href={`/shop?${new URLSearchParams({ ...(category ? { category } : {}), "filter.v.availability": "1" }).toString()}`}>In stock</Link></div></details>
            <span className="collection-count">{sorted.length} products</span>
            <SortSelect value={sort} category={category} search={search} />
          </div>
          {activeFilters.length > 0 && <div className="active-filter-chips" aria-label="Active filters">{activeFilters.map((filter) => <Link href={filter.remove} key={filter.label}>{filter.label}<span aria-hidden="true">×</span></Link>)}<Link href="/shop" className="clear-all-filters">Clear all</Link></div>}
          <p className="mobile-product-count">{sorted.length} products</p>
          <ProductGrid products={sorted} badges={badges} fillSlots />
          {sorted.length === 0 && <div className="empty-collection"><strong>No plush found just yet.</strong><p>Try a different search or clear your filters.</p><Link className="shop-button shop-button-orange" href="/shop">See all plush</Link></div>}
        </section>
      </div>
    </SiteFrame>
  );
}
