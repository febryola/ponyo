import Image from "next/image";
import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";
import { HomeCarousel } from "@/components/home/home-carousel";
import { HomeSparkleRain } from "@/components/home/home-sparkle-rain";
import { AnimalTabs } from "@/components/home/animal-tabs";
import { HomeStatCount } from "@/components/home/home-stat-count";
import { HomeInterestForms } from "@/components/layout/local-store-forms";
import { ProductShelf } from "@/components/product/product-shelf";
import { getLocalizedProducts } from "@/services/localized-products.server";
import { LocalizedPrice, LocalizedText } from "@/components/layout/localization-provider";
import type { Product } from "@/types/product";
import locale from "@/locales/en.default.json";

const images = {
  bunny: "/images/catalog/maker-bunny.jpg",
  bear: "/images/catalog/maker-bear.jpg",
  cat: "/images/catalog/maker-cat.jpg",
  dinosaur: "/images/catalog/maker-dinosaur.jpg",
  dog: "/images/catalog/maker-dog.jpg",
  penguin: "/images/catalog/maker-penguin.jpg",
  chick: "/images/catalog/maker-chick.jpg",
  panda: "/images/catalog/ponyo-12.png",
  premium: "/images/catalog/ponyo-5.png",
  xlCat: "/images/catalog/ponyo-11.png",
};

const categories = [
  { title: "Giant plush", href: "/pages/domina-xl", image: "/images/catalog/ponyo-3.png" },
  { title: "Bears", href: "/collections/bears", image: images.bear },
  { title: "Bunnies", href: "/collections/bunnies", image: images.bunny },
  { title: "Cats", href: "/collections/cats", image: images.cat },
  { title: "Cute Characters", href: "/collections/characters", image: images.dinosaur },
  { title: "Premium", href: "/collections/premium", image: images.premium },
  { title: "Pandas", href: "/collections/pandas", image: images.panda },
  { title: "Puppies", href: "/collections/puppies", image: images.dog },
  { title: "Penguins", href: "/collections/penguins", image: images.penguin },
  { title: "More plush", href: "/collections/all", image: images.chick },
];

function byTag(products: Product[], tag: string, limit = 4) {
  return products.filter((product) => product.tags?.includes(tag)).slice(0, limit);
}

function AisleCard({ title, description, titleKey, descriptionKey, href, products }: { title: string; description: string; titleKey: string; descriptionKey: string; href: string; products: Product[] }) {
  return (
    <article className="marketplace-aisle">
      <LocalizedText as="h3" translationKey={titleKey} fallback={title} /><LocalizedText as="p" translationKey={descriptionKey} fallback={description} />
      <div className="marketplace-aisle-grid">
        {products.slice(0, 4).map((product) => <Link href={`/products/${product.id}`} className="aisle-product" key={product.id}><span className="aisle-product-image"><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 640px) 42vw, 130px" /></span><span className="aisle-product-title">{product.name}</span><strong><LocalizedPrice amount={product.priceAmount} sourceCurrency={product.currency} /></strong></Link>)}
        {products.length > 0 && products.length < 4 && <Link href={href} className="aisle-see-all"><span>→</span>See all</Link>}
      </div>
      <Link href={href} className="aisle-link"><LocalizedText translationKey="home.aisles.see_more" fallback={`Shop more ${title} →`} values={{ title }} /></Link>
    </article>
  );
}

export default async function Home() {
  const products = await getLocalizedProducts();
  const rare = byTag(products, "rare", 5);
  const premium = byTag(products, "premium", 12);
  const domina = byTag(products, "domina-xl", 6);
  const arrivals = byTag(products, "new-arrival", 10);
  const rareSpotlight = products.find((product) => product.slug === "cherry-blossom-bunny") ?? rare[0];
  const rareSupporting = products.filter((product) => ["mint-dino", "hoshi-cloud-bear"].includes(product.slug));
  const allTrending = products.filter((product) => !product.tags?.includes("new-arrival")).slice(0, 12);
  const aisles = [
    { title: "Rare Finds", description: "Hard-to-find and limited-edition plush.", titleKey: "home.aisles.rare_title", descriptionKey: "home.aisles.rare_sub", href: "/collections/rare-finds", products: rare },
    { title: "Premium Plushies", description: "Top-quality plush with extra-soft finishes.", titleKey: "home.aisles.premium_title", descriptionKey: "home.aisles.premium_sub", href: "/collections/premium", products: premium.slice(0, 4) },
    { title: "XL Goodies", description: "Giant plush, big enough to hug back.", titleKey: "home.aisles.xl_title", descriptionKey: "home.aisles.xl_sub", href: "/collections/domina-xl", products: domina },
    { title: "Shop by animal", description: "Bears, bunnies, cats and more.", titleKey: "home.aisles.animal_title", descriptionKey: "home.aisles.animal_sub", href: "/collections", products: ["bears", "bunnies", "cats", "pandas"].map((category) => products.find((product) => product.categoryName.toLocaleLowerCase() === category || product.tags?.some((tag) => tag.toLocaleLowerCase() === category))).filter((product): product is Product => Boolean(product)) },
  ];
  const faq = locale.pg.faq;

  return (
    <SiteFrame className="store-home">
      <HomeSparkleRain />
      <HomeCarousel hasCollectibles={products.some((product) => product.tags?.includes("collectibles"))} />

      <section className="home-marketplace-intro" aria-labelledby="home-hero-heading">
        <span className="home-marketplace-eyebrow">{locale.mp.hero_eyebrow}</span>
        <h1 id="home-hero-heading">{locale.mp.hero_heading} <span>{locale.mp.hero_heading_accent}</span></h1>
        <p>{locale.mp.hero_body}</p>
        <div className="home-marketplace-actions">
          <Link href="/collections/all">{locale.mp.hero_cta_shop}</Link>
          <Link href="/pages/domina-xl">{locale.mp.hero_cta_domina}</Link>
        </div>
      </section>

      <section className="store-stats-bar" aria-label="Ponyo collection highlights" data-sparkle-end>
        <div className="store-stats">
          <Link className="store-stat-all" href="/collections/all"><b>🧸</b><span className="store-stat-copy"><strong><HomeStatCount value={products.length} /></strong><span>{locale.home.stats.all}</span></span></Link>
          {rare.length > 0 && <Link className="store-stat-rare" href="/collections/rare-finds"><b>💎</b><span className="store-stat-copy"><strong><HomeStatCount value={rare.length} /></strong><span>{locale.home.stats.rare}</span></span></Link>}
          {premium.length > 0 && <Link className="store-stat-premium" href="/collections/premium"><b>✨</b><span className="store-stat-copy"><strong><HomeStatCount value={premium.length} /></strong><span>{locale.home.stats.premium}</span></span></Link>}
          <Link className="store-stat-xl" href="/pages/domina-xl"><b>📏</b><span className="store-stat-copy"><strong><HomeStatCount value={120} /> <small>cm</small></strong><span>{locale.home.stats.xl}</span></span></Link>
        </div>
      </section>

      <nav className="home-category-rail" aria-label="Shop by type">
        <div className="home-category-rail-card"><strong>Find your kind of plush</strong>
          <ul>{categories.map((category) => <li key={category.title}><Link href={category.href}><Image src={category.image} alt="" width={56} height={56} /><span>{category.title}</span></Link></li>)}</ul>
        </div>
      </nav>

      <section className="marketplace-aisles store-container" aria-labelledby="aisles-heading">
        <header><div><span className="marketplace-aisles-eyebrow">A little something for everyone</span><h2 id="aisles-heading"><LocalizedText as="span" translationKey="home.aisles.title" fallback="Shop every kind of plush" /></h2><p><LocalizedText translationKey="home.aisles.sub" fallback="Rare finds, premium plushies and XL goodies, all in one place." /></p></div><Link href="/collections/all" className="marketplace-aisles-view-all">Explore all plush <span aria-hidden="true">→</span></Link></header>
        <div className="marketplace-aisles-grid">{aisles.map((aisle) => <AisleCard key={aisle.title} {...aisle} />)}</div>
      </section>

      <section className="budget-section store-container">
        <header><h2>Shop by budget</h2><p>Find your next plush at the price that feels right.</p></header>
        <div className="budget-links">
          <Link href="/collections/all?filter.v.price.lte=20000"><span>Sweet treats</span><strong>Under ¥20,000</strong><i aria-hidden="true">→</i></Link>
          <Link href="/collections/all?filter.v.price.gte=20000&filter.v.price.lte=30000"><span>Fan favourites</span><strong>¥20,000–¥30,000</strong><i aria-hidden="true">→</i></Link>
          <Link href="/collections/all?filter.v.price.gte=60000"><span>Giant splurge</span><strong>¥60,000+</strong><i aria-hidden="true">→</i></Link>
        </div>
      </section>

      {rareSpotlight && <section className="rare-spotlight store-container" id="rare-finds">
        <header><div><h2>Rare Finds</h2><p>Retired, discontinued, and limited-edition plush that is hard to find anywhere else.</p></div><Link href="/collections/rare-finds">See all →</Link></header>
        <div className="rare-spotlight-grid">
          <Link className="rare-featured-product" href={`/products/${rareSpotlight.id}`}><Image src={rareSpotlight.image} alt={rareSpotlight.imageAlt} fill sizes="(max-width: 1024px) 100vw, 52vw" /><span className="rare-spotlight-shade"/><span className="rare-spotlight-badge">✦ Spotlight</span><span className="rare-featured-copy"><strong>{rareSpotlight.name}</strong>{rareSpotlight.size && <small>{rareSpotlight.size}</small>}<b><LocalizedPrice amount={rareSpotlight.priceAmount} sourceCurrency={rareSpotlight.currency} /> <i>View plush →</i></b></span></Link>
          <div className="rare-supporting-grid">{rareSupporting.map((product) => <Link href={`/products/${product.id}`} key={product.id}><span className="rare-supporting-image"><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 700px) 44vw, 24vw"/></span><span className="rare-supporting-badge">{product.tags?.includes("rare") && "✦ Rare · New"}</span><strong>{product.name}</strong><small>{product.size ?? product.sizeTier ?? product.productType ?? product.categoryName}</small><b><LocalizedPrice amount={product.priceAmount} sourceCurrency={product.currency} /></b></Link>)}</div>
        </div>
      </section>}

      <ProductShelf className="home-live-shelf" id="new-arrivals" eyebrow="Just landed" title="Just landed" description="The newest plush on Ponyo. Swipe to see them all." products={arrivals} href="/collections/new-arrivals" linkLabel="See all →" rail compact />
      <ProductShelf className="home-live-shelf" id="more-plush" eyebrow="Trending now" title="More plush to discover" description="A fresh mix from across the Ponyo catalog." products={allTrending} href="/collections/all" linkLabel="See all →" />
      <AnimalTabs products={products} />

      <section className="lifestyle-break">
        <Image src="/images/catalog/ponyo-6.png" alt="A pile of plush friends on a cosy pastel bed" fill sizes="100vw" />
        <div><span aria-hidden="true">🧸</span><h2>Every plush has a story. Find yours.</h2><Link href="/shop">Shop all plush →</Link></div>
      </section>

      <section className="size-guide store-container" id="sizes">
        <header><h2>How big is big?</h2><p>From pocket pals to room-filling giants. Tap a size to shop it.</p></header>
        <div className="size-guide-tiles">
          {[
            { className: "size-guide-jellyfish", delay: "0s" },
            { className: "size-guide-jellyfish size-guide-jellyfish--friend", delay: "-1.1s" },
            { className: "size-guide-jellyfish size-guide-jellyfish--tiny", delay: "-2.2s" },
          ].map((jellyfish) => <span key={jellyfish.className} className={jellyfish.className} style={{ animationDelay: jellyfish.delay }} aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M12 29C12 16 20 7 32 7s20 9 20 22c0 5-4 8-8 8H20c-4 0-8-3-8-8Z"/><circle cx="26" cy="24" r="2.5"/><circle cx="38" cy="24" r="2.5"/><path d="M22 30c2 2 4 2 6 0M19 39c0 5-2 7-2 11m10-11c0 5 2 7 0 12m8-12c0 5-1 7 1 12m7-12c0 5 2 7 1 11"/></svg></span>)}
          {[{ name: "Small", range: "Under 25 cm", image: images.chick, size: "Small" }, { name: "Medium", range: "25–45 cm", image: images.bear, size: "Medium" }, { name: "Large", range: "45–70 cm", image: images.dog, size: "Large" }, { name: "XL", range: "70 cm +", image: images.xlCat, size: "XL" }].map((tile) => <Link className={`size-guide-tile size-guide-tile--${tile.name.toLowerCase()}`} href={`/collections/all?filter.p.m.ponyo.size_tier=${tile.size}`} key={tile.name}><span><Image src={tile.image} alt={`${tile.name} plush size example`} fill sizes="(max-width: 640px) 30vw, 230px" /></span><strong>{tile.name}</strong><small>{tile.range}</small></Link>)}
        </div>
      </section>

      <section className="domina-band" id="domina">
        <div className="domina-band-copy"><span className="domina-eyebrow">DOMINA BY PONYO</span><h2>Room for Something Extraordinary.</h2><p>Meet Domina XL — oversized plush companions to bring comfort, character, and a little wonder into your space.</p><Link href="/pages/domina-xl">Shop giant plush →</Link></div>
        <figure><div className="domina-band-image"><Image src="/images/catalog/ponyo-3.png" alt="A person holding an oversized cream bunny plush to show its real-world scale" fill sizes="(max-width: 767px) 90vw, 560px"/></div><figcaption>A plush with presence.</figcaption></figure>
      </section>

      <ProductShelf className="home-live-shelf" id="domina-products" eyebrow="Big plush, memorable presence" title="XL Goodies" products={domina} href="/collections/domina-xl" linkLabel="See all →" />
      <ProductShelf className="home-live-shelf premium-picks" id="most-loved" eyebrow="Premium Picks" title="Premium Picks" description="A handpicked mix of distinctive faces, colors, and character." products={premium} href="/collections/premium" linkLabel="See all →" />

      <section className="quick-faq store-container">
        <header><div><h2>Quick answers</h2><p>New to Ponyo? Here is what shoppers ask most.</p></div><Link href="/pages/faq">All FAQs →</Link></header>
        <div className="quick-faq-list">{[[faq.ordering_q1, faq.ordering_a1], [faq.shipping_q2, faq.shipping_a2], [faq.sizes_q1, faq.sizes_a1]].map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>
      </section>

      <HomeInterestForms />
    </SiteFrame>
  );
}
