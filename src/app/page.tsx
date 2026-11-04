import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { ProductShelf } from "@/components/product/product-shelf";
import { CategoryScrollButton } from "@/components/ui/category-scroll-button";
import { getProducts } from "@/services/product.service";
import type { Product } from "@/types/product";
import dominaImage from "@/sample-frontend/images/3.png";
import journalGroupImage from "@/sample-frontend/images/2.png";
import journalDetailImage from "@/sample-frontend/images/5.png";
import categoryBearImage from "@/sample-frontend/images/crop/maker-bear.jpg";
import categoryBunnyImage from "@/sample-frontend/images/crop/maker-bunny.jpg";
import categoryCatImage from "@/sample-frontend/images/crop/maker-cat.jpg";
import categoryDinoImage from "@/sample-frontend/images/crop/maker-dinosaur.jpg";
import categoryChickImage from "@/sample-frontend/images/crop/maker-chick.jpg";
import categoryDogImage from "@/sample-frontend/images/crop/maker-dog.jpg";
import categoryPenguinImage from "@/sample-frontend/images/crop/maker-penguin.jpg";
import pandaImage from "@/sample-frontend/images/12.png";

const badges = {
  "hoshi-cloud-bear": "Trending",
  "haneul-bunny": "Loved",
  "mint-dino": "Standout",
  "bluebell-penguin": "Popular",
};

function Sparkle({ className }: { className: string }) {
  return (
    <span className={`hero-sparkle ${className}`}>
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 1.5 19.7 12l10.8 4-10.8 3.8L16 30.5l-3.8-10.7L1.5 16l10.7-4L16 1.5Z" fill="currentColor" /></svg>
    </span>
  );
}

function BrandLogo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`logo${light ? " logo-light" : ""}`} aria-label="Ponyo home">
      <span className="logo-mark"><svg className="icon-jelly" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z" fill="var(--rose)" />
        <path d="M18 27C18 18 24 11 32 11C40 11 46 18 46 27" fill="none" stroke="var(--white)" strokeWidth="2" strokeLinecap="round" opacity=".5" />
        <circle cx="26" cy="23" r="2.6" fill="var(--cocoa)" /><circle cx="38" cy="23" r="2.6" fill="var(--cocoa)" />
        <path d="M22 29c1.4 1.6 3 1.6 4.4 0" stroke="var(--cocoa)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10" stroke="var(--rose)" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".85" />
      </svg></span><span className="logo-word">PONYO</span>
    </Link>
  );
}

function JournalCard({ href, image, alt, kicker, title, action }: {
  href: string;
  image: typeof dominaImage;
  alt: string;
  kicker: string;
  title: string;
  action: string;
  priority?: boolean;
}) {
  return (
    <Link href={href} className="home-journal-card">
      <Image src={image} alt={alt} fill priority={priority} sizes="(max-width: 560px) 90vw, 33vw" />
      <span className="home-journal-copy"><span>{kicker}</span><strong>{title}</strong><span>{action}</span></span>
    </Link>
  );
}

function pick(products: Product[], slugs: string[]) {
  return slugs.map((slug) => products.find((product) => product.slug === slug)).filter((product): product is Product => Boolean(product));
}

export default async function Home() {
  const products = await getProducts();
  const trending = pick(products, ["hoshi-cloud-bear", "haneul-bunny", "mint-dino", "bluebell-penguin"]);
  const recommended = pick(products, ["good-things-ahead-kitty", "better-days-panda", "biscuit-bow-pup", "cloud-cat"]);
  const newArrivals = pick(products, ["good-things-ahead-kitty", "better-days-panda", "biscuit-bow-pup", "cloud-cat", "sunny-chick", "cherry-blossom-bunny"]);
  const dominaProducts = pick(products, ["hoshi-cloud-bear-xl", "haneul-bunny-xl", "baluran-elephant-xl", "clement-fox-xl"]);

  return (
    <>
      <SiteHeader />
      <main className="home-page" id="top">
        <section className="hero home-hero">
          <div className="home-hero-sparkles" aria-hidden="true">
            <Sparkle className="sparkle-one" /><Sparkle className="sparkle-two" /><Sparkle className="sparkle-three" />
            <Sparkle className="sparkle-four" /><Sparkle className="sparkle-five" /><Sparkle className="sparkle-six" />
            <span className="hero-sparkle sparkle-moon"><svg viewBox="0 0 32 32"><path d="M24.8 21.4A12.6 12.6 0 0 1 10.6 7.2 12.8 12.8 0 1 0 24.8 21.4Z" fill="currentColor" /></svg></span>
          </div>
          <div className="container home-hero-inner">
            <div className="home-hero-copy">
              <p className="eyebrow">Rare finds · oversized plush</p>
              <h1>Extraordinary Finds. <span>Impossible to Ignore.</span></h1>
              <p className="home-hero-sub">Discover rare, premium, and oversized plushies you won&apos;t easily find anywhere else.</p>
              <div className="hero-ctas">
                <Link href="/shop" className="btn btn-primary">Shop the collection →</Link>
                <Link href="/shop?category=giant-plush" className="btn btn-outline">Explore Domina XL</Link>
              </div>
              <p className="home-hero-note">Independent makers · Premium by design · Thoughtful delivery</p>
            </div>
            <Link className="home-hero-visual" href="/shop?category=giant-plush" aria-label="Shop the Domina XL oversized plush collection">
              <Image src={dominaImage} alt="Oversized cream bunny plush photographed in a cozy room" fill priority sizes="(max-width: 560px) 100vw, (max-width: 860px) 48vw, 50vw" />
              <span className="hero-product-tag"><span>DOMINA XL COLLECTION</span><strong>Shop giant plush <b aria-hidden="true">→</b></strong></span>
            </Link>
          </div>
        </section>

        <section className="category-section container" id="edit" aria-label="Shop by product type">
          <div className="category-bar">
            <p className="category-label">Find your<br />kind of plush</p>
            <div className="category-list">
              <Link className="category-pill" href="/shop?category=giant-plush"><span className="cat-icon cat-domina"><Image src={dominaImage} alt="" /></span>Giant plush</Link>
              <Link className="category-pill" href="/shop?category=bears"><span className="cat-icon cat-bear"><Image src={categoryBearImage} alt="" /></span>Bears</Link>
              <Link className="category-pill" href="/shop?category=bunnies"><span className="cat-icon cat-bunny"><Image src={categoryBunnyImage} alt="" /></span>Bunnies</Link>
              <Link className="category-pill" href="/shop?category=cats"><span className="cat-icon cat-cat"><Image src={categoryCatImage} alt="" /></span>Cats</Link>
              <Link className="category-pill" href="/shop?category=characters"><span className="cat-icon cat-char"><Image src={categoryDinoImage} alt="" /></span>Characters</Link>
              <Link className="category-pill" href="/shop"><span className="cat-icon cat-char"><Image src={categoryChickImage} alt="" /></span>More plush</Link>
              <Link className="category-pill" href="/shop?q=panda"><span className="cat-icon cat-char"><Image src={pandaImage} alt="" /></span>Pandas</Link>
              <Link className="category-pill" href="/shop?q=puppy"><span className="cat-icon cat-bunny"><Image src={categoryDogImage} alt="" /></span>Puppies</Link>
              <Link className="category-pill" href="/shop?q=penguin"><span className="cat-icon cat-bird"><Image src={categoryPenguinImage} alt="" /></span>Penguins</Link>
            </div>
            <CategoryScrollButton />
          </div>
        </section>

        <ProductShelf id="rare-finds" eyebrow="Standout plush finds" title="Worth Discovering." description="A selection of plush with distinctive design, details, and character." products={trending} badges={badges} />
        <ProductShelf className="marketplace-shelf" eyebrow="Easy to revisit" title="Buy Again" description="Shortcuts to revisit plush from the collection." products={trending} rail compact linkLabel="Shop all →" />
        <ProductShelf className="marketplace-shelf" eyebrow="A few character-rich picks" title="Recommended for You" description="A curated mix to help you discover a new favorite." products={recommended} rail compact linkLabel="Explore more →" />
        <ProductShelf id="new-limited" className="home-new-arrivals marketplace-shelf" eyebrow="Just added to the collection" title="New Arrivals" description="Meet the latest plush additions, including two new character designs." products={newArrivals} rail badges={{
          "good-things-ahead-kitty": "New", "better-days-panda": "New", "biscuit-bow-pup": "New", "cloud-cat": "New", "sunny-chick": "New", "cherry-blossom-bunny": "New",
        }} linkLabel="Browse collection →" />
        <ProductShelf className="marketplace-shelf" eyebrow="A Ponyo-curated edit" title="Most-Loved Picks" description="A handpicked mix of distinctive faces, colors, and character." products={trending} rail compact linkLabel="See the collection →" />

        <section className="domina" id="domina">
          <span className="deco star d1" aria-hidden="true">✦</span><span className="deco star d2" aria-hidden="true">⭐</span><span className="deco heart d3" aria-hidden="true">♡</span>
          <div className="container domina-inner">
            <div className="domina-copy">
              <p className="eyebrow eyebrow-light">OVERSIZED PLUSH · DOMINA XL</p>
              <h2>Room for Something Extraordinary.</h2>
              <p className="domina-sub">Meet Domina XL — oversized plush companions to bring comfort, character, and a little wonder into your space.</p>
              <Link href="/shop?category=giant-plush" className="btn btn-light">Shop giant plush →</Link>
            </div>
            <div className="domina-visual"><div className="ph-domina domina-scale-visual">
              <Image src={dominaImage} alt="Oversized cream bunny plush in a warm bedroom" fill sizes="(max-width: 860px) 90vw, 42vw" />
              <span className="scale-caption">A plush with presence.</span>
            </div></div>
          </div>
        </section>

        <ProductShelf className="domina-product-shelf" eyebrow="Big plush, memorable presence" title="Shop Domina XL" products={dominaProducts} rail compact linkLabel="View all XL plush →" href="/shop?category=giant-plush" />

        <section className="home-journal container" id="journal">
          <div className="section-head"><div><p className="eyebrow">Stories, guides &amp; product details</p><h2 className="section-title">A Closer Look at Plush.</h2></div><Link href="/#journal" className="view-all">Read the journal →</Link></div>
          <div className="home-journal-grid">
            <JournalCard href="/#journal" image={dominaImage} alt="An oversized bunny plush in a cozy bedroom" kicker="SIZE & SPACE" title="Choosing an XL plush for your space" action="Read the guide →" />
            <JournalCard href="/#journal" image={journalDetailImage} alt="Close-up details of a soft teddy bear plush" kicker="LOOK CLOSER" title="The little details that make a plush" action="Explore the details →" />
            <JournalCard href="/#journal" image={journalGroupImage} alt="A selection of plush characters arranged together" kicker="CARE NOTES" title="Simple ways to care for a favorite" action="Read care notes →" />
          </div>
        </section>

        <section className="shipping-details container" id="destinations" aria-label="Shipping information">
          <div className="trust-pill shipping-note"><div className="trust-col">
            <div className="trust-icon trust-icon-blue" aria-hidden="true">↗</div>
            <div><h4>Shipping &amp; delivery</h4><p>Available options and estimates depend on your destination.</p></div>
            <Link className="view-all" href="/checkout">View shipping details →</Link>
          </div></div>
        </section>

        <section className="newsletter container">
          <div className="newsletter-inner">
            <div className="newsletter-mascot left"><div className="mascot-octo" aria-hidden="true" /><div className="speech-bubble small">New plush finds &amp; notes</div></div>
            <div className="newsletter-form-wrap">
              <h2>Get first dibs on new plush drops.</h2>
              <div className="newsletter-form">
                <label className="newsletter-input"><span aria-hidden="true">✉️</span><input type="email" placeholder="Your email address" aria-label="Email address" required /></label>
                <button type="button" className="btn btn-primary btn-round" aria-label="Subscribe">→</button>
              </div>
              <div className="social-row" aria-label="Follow Ponyo">
                <a href="#story" className="social-icon-link" aria-label="Instagram"><span aria-hidden="true">◎</span></a>
                <a href="#story" className="social-icon-link" aria-label="TikTok"><span aria-hidden="true">♪</span></a>
                <a href="#story" className="social-icon-link" aria-label="YouTube"><span aria-hidden="true">▶</span></a>
                <a href="#story" className="social-icon-link" aria-label="Pinterest"><span aria-hidden="true">P</span></a>
              </div>
            </div>
            <div className="newsletter-mascot right"><div className="mascot-octo mascot-pink" aria-hidden="true" /><div className="speech-bubble small">PONYO<br />Softness for a<br />kinder world ♡</div></div>
          </div>
        </section>
      </main>

      <footer className="site-footer" id="story">
        <div className="footer-meadow" aria-hidden="true"><span className="meadow-item m1" /><span className="meadow-item m2" /><span className="meadow-item m3" /><span className="meadow-item m4" /><span className="meadow-item m5" /><span className="meadow-item m6" /><span className="meadow-item m7" /></div>
        <svg className="footer-wave" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 C240 0 480 80 720 40 C960 0 1200 80 1440 40 L1440 80 L0 80Z" fill="currentColor" /></svg>
        <div className="container footer-grid">
          <div className="footer-brand"><BrandLogo light /><p>A curated collection of rare, premium, and distinctive plushies. ♡</p></div>
          <div className="footer-col"><h5>Shop</h5><Link href="/shop">Shop All</Link><Link href="/shop#rare-finds">Rare Finds</Link><Link href="/shop?category=giant-plush">Domina XL</Link></div>
          <div className="footer-col"><h5>Explore</h5><Link href="/#journal">The Plush Journal</Link><Link href="/#story">About Ponyo</Link><Link href="/shop">Become a Maker</Link></div>
          <div className="footer-col"><h5>Support</h5><Link href="/checkout">FAQ &amp; Shipping</Link><Link href="/checkout">Returns &amp; Refunds</Link><Link href="/orders">Contact Us</Link></div>
        </div>
        <div className="footer-bottom-bar"><p>© {new Date().getFullYear()} Ponyo. All rights reserved.</p><p className="footer-legal"><Link href="/#story">Privacy Policy</Link> · <Link href="/#story">Terms of Service</Link> · <Link href="/checkout">Shipping Policy</Link></p></div>
      </footer>
    </>
  );
}
