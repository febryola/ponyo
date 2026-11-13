import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { LocalContactForm } from "@/components/layout/local-store-forms";
import { LocalizedText } from "@/components/layout/localization-provider";
import { PartnerInquiryForm } from "@/components/layout/partner-inquiry-form";
import { ProductGrid } from "@/components/product/product-grid";
import { SortSelect } from "@/components/product/sort-select";
import { getLocalizedProducts } from "@/services/localized-products.server";
import locale from "@/locales/en.default.json";

const faq = locale.pg.faq;
const about = locale.pg.about;
const domina = locale.home.domina_page;
const sizeRows = [
  ["Small", "Under 25 cm", "/shop?filter.p.m.ponyo.size_tier=Small"],
  ["Medium", "25–45 cm", "/shop?filter.p.m.ponyo.size_tier=Medium"],
  ["Large", "45–70 cm", "/shop?filter.p.m.ponyo.size_tier=Large"],
  ["XL", "70 cm +", "/shop?filter.p.m.ponyo.size_tier=XL"],
  ["Domina Giant", "100 cm +", "/shop?filter.p.m.ponyo.size_tier=Giant"],
] as const;
const dominaSortOptions = [
  { value: "featured", label: "Featured" },
  { value: "title-ascending", label: "Alphabetically, A–Z" },
  { value: "title-descending", label: "Alphabetically, Z–A" },
  { value: "price-ascending", label: "Price, low to high" },
  { value: "price-descending", label: "Price, high to low" },
  { value: "created-ascending", label: "Date, old to new" },
  { value: "created-descending", label: "Date, new to old" },
];

const faqGroups = [
  { id: "ordering", title: faq.ordering_title, questions: [[faq.ordering_q1, faq.ordering_a1], [faq.ordering_q2, faq.ordering_a2], [faq.ordering_q3, faq.ordering_a3]] },
  { id: "shipping", title: faq.shipping_title, questions: [[faq.shipping_q1, faq.shipping_a1], [faq.shipping_q2, faq.shipping_a2], [faq.shipping_q3, faq.shipping_a3], [faq.shipping_q4, faq.shipping_a4]] },
  { id: "sizes", title: faq.sizes_title, questions: [[faq.sizes_q1, faq.sizes_a1], [faq.sizes_q2, faq.sizes_a2], [faq.sizes_q3, faq.sizes_a3]] },
  { id: "care", title: faq.care_title, questions: [[faq.care_q1, faq.care_a1], [faq.care_q2, faq.care_a2]] },
  { id: "help", title: faq.help_title, questions: [[faq.help_q1, faq.help_a1], [faq.help_q2, faq.help_a2], [faq.help_q3, faq.help_a3]] },
];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "faq") return { title: faq.title, description: faq.sub };
  if (slug === "about") return { title: about.title, description: about.intro };
  if (slug === "domina-xl") return { title: "Domina XL", description: domina.sub };
  if (slug === "contact") return { title: "Contact Ponyo" };
  if (slug === "partners") return { title: "Partner with Ponyo", description: "Share your plush collection with the Ponyo community." };
  return { title: "Ponyo" };
}

function AboutPage() {
  return <>
    <section className="content-page store-container about-page">
      <div className="about-hero"><div><span className="about-eyebrow">{about.eyebrow}</span><h1>{about.heading} <em>{about.heading_accent}</em></h1><p>{about.intro}</p><p>{about.intro2}</p><div className="about-actions"><Link className="shop-button shop-button-orange" href="/shop">{about.cta_shop}</Link><Link className="about-secondary-button" href="/pages/domina-xl">{about.cta_domina}</Link></div></div><Image src="/images/catalog/ponyo-5.png" alt="Soft plush toys gathered together" width={600} height={700} priority /></div>
      <h2 className="about-section-title">{about.promise_title}</h2><div className="about-promise-grid">{[[about.v1_title, about.v1_body, "♡"], [about.v2_title, about.v2_body, "⌕"], [about.v3_title, about.v3_body, "↕"]].map(([title, body, icon]) => <article key={title}><span>{icon}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
      <h2 className="about-section-title">Shop by size</h2><div className="about-size-grid">{sizeRows.map(([name, range, href]) => <Link href={href} key={name}><strong>{name}</strong><span>{range}</span></Link>)}</div>
      <section className="about-closing"><h2>{about.closing_title}</h2><p>{about.closing_body}</p><Link className="shop-button shop-button-orange" href="/shop">{about.cta_shop}</Link></section>
    </section>
  </>;
}

function FaqPage() {
  return <div className="store-container faq-page">
    <header className="faq-page-header">
      <div className="faq-hero-copy">
        <span className="faq-eyebrow"><span aria-hidden="true">✦</span> THE PONYO HELP STUDIO</span>
        <h1>{faq.title}<span className="faq-title-mark" aria-hidden="true">?</span></h1>
        <p>{faq.sub}</p>
        <nav aria-label={faq.topics}>{faqGroups.map((group) => <a href={`#faq-${group.id}`} key={group.id}><span className="faq-topic-nav-icon" aria-hidden="true"><FaqIcon name={group.id} /></span>{group.title}<span className="faq-nav-arrow" aria-hidden="true">↗</span></a>)}</nav>
      </div>
      <div className="faq-hero-art" aria-hidden="true">
        <span className="faq-art-orbit faq-art-orbit--one" />
        <span className="faq-art-orbit faq-art-orbit--two" />
        <span className="faq-art-spark faq-art-spark--one">✦</span>
        <span className="faq-art-spark faq-art-spark--two">✧</span>
        <span className="faq-art-icon"><FaqIcon name="help" /></span>
        <Image src="/ponyo-jellyfish.svg" alt="" width={102} height={102} priority />
        <span className="faq-art-caption">A little help,<br />a lot of heart.</span>
      </div>
    </header>
    <div className="faq-service-notes" aria-label="Helpful shopping information">
      <article><span aria-hidden="true"><FaqIcon name="package" /></span><div><strong>Thoughtful packing</strong><small>Every plush is prepared with care.</small></div></article>
      <article><span aria-hidden="true"><FaqIcon name="pin" /></span><div><strong>Delivery, your way</strong><small>Options appear for your address at checkout.</small></div></article>
      <article><span aria-hidden="true"><FaqIcon name="sparkle" /></span><div><strong>Here when you need us</strong><small>Our team is happy to help.</small></div></article>
    </div>
    <div className="faq-page-groups">{faqGroups.map((group) => <section id={`faq-${group.id}`} key={group.id} className={`faq-topic faq-topic--${group.id}`}>
      <div className="faq-topic-heading"><span className="faq-topic-icon" aria-hidden="true"><FaqIcon name={group.id} /></span><div><span className="faq-topic-kicker">PONYO GUIDE · 0{faqGroups.indexOf(group) + 1}</span><h2>{group.title}</h2></div><span className="faq-question-count">{String(group.questions.length).padStart(2, "0")} answers</span></div>
      {group.id === "shipping" && <div className="shipping-journey" aria-label="How delivery information works">
        <article><span className="shipping-step-number">01</span><span className="shipping-step-icon" aria-hidden="true"><FaqIcon name="tag" /></span><div><strong>Choose your plush</strong><small>Check the dispatch time on its product page.</small></div></article>
        <span className="shipping-journey-connector" aria-hidden="true">······›</span>
        <article><span className="shipping-step-number">02</span><span className="shipping-step-icon" aria-hidden="true"><FaqIcon name="pin" /></span><div><strong>See delivery options</strong><small>Enter your address to see availability and exact cost.</small></div></article>
        <span className="shipping-journey-connector" aria-hidden="true">······›</span>
        <article><span className="shipping-step-number">03</span><span className="shipping-step-icon" aria-hidden="true"><FaqIcon name="package" /></span><div><strong>Follow your order</strong><small>We email a dispatch update, with tracking when available.</small></div></article>
      </div>}
      <div className="faq-topic-questions">{group.questions.map(([question, answer], index) => <details key={question} open={group.id === "ordering" && index === 0}><summary><span className="faq-question-text">{question}</span><span className="faq-toggle" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></span></summary><p>{answer}</p></details>)}</div>
      {group.id === "sizes" && <div className="faq-size-table"><table><caption className="sr-only">Ponyo plush size ranges</caption><tbody>{sizeRows.map(([name, range]) => <tr key={name}><th scope="row">{name}</th><td>{range}</td></tr>)}</tbody></table></div>}
    </section>)}</div>
    <section className="faq-contact-cta"><h2>{faq.contact_title}</h2><p>{faq.contact_body}</p><Link className="shop-button shop-button-orange" href="/pages/contact">{faq.contact_cta}</Link></section>
  </div>;
}

function FaqIcon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.65, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "ordering" || name === "package") return <svg {...common}><path d="m3.5 7 8.5-4 8.5 4v10L12 21l-8.5-4V7Z"/><path d="m3.8 7.2 8.2 4 8.2-4M12 11.2V21M8 5l8.2 4"/></svg>;
  if (name === "shipping" || name === "pin") return <svg {...common}><path d="M3 6.5h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/><path d="M17 10v3h4"/></svg>;
  if (name === "sizes" || name === "tag") return <svg {...common}><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8" cy="8" r="1.2"/><path d="M13 7v4M11 9h4"/></svg>;
  if (name === "care" || name === "sparkle") return <svg {...common}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 3l.7 1.8L7.5 5.5l-1.8.7L5 8l-.7-1.8-1.8-.7 1.8-.7L5 3Z"/></svg>;
  return <svg {...common}><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9.7 9a2.3 2.3 0 1 1 3.8 1.7c-1 .9-1.5 1.2-1.5 2.3M12 15.8h.01"/></svg>;
}

function ContactPage() {
  return <div className="store-container contact-page contact-page--studio">
    <div className="contact-studio-layout">
      <section className="contact-studio-intro" aria-labelledby="contact-title">
        <span className="contact-studio-eyebrow"><span aria-hidden="true">✦</span> <LocalizedText translationKey="contact.eyebrow" fallback="A LITTLE HELP, A LOT OF HEART" /></span>
        <h1 id="contact-title"><LocalizedText translationKey="contact.title" fallback="How can we help?" /></h1>
        <p className="contact-studio-lead"><LocalizedText translationKey="contact.intro" fallback="Questions about an order, delivery, or finding a plush? You’re in the right place." /></p>
        <div className="contact-team-note"><span className="contact-mascot" aria-hidden="true"><Image src="/ponyo-jellyfish.svg" alt="" width={64} height={64} /></span><div><h2><LocalizedText translationKey="contact.team" fallback="Real people. Thoughtful help." /></h2><p><LocalizedText translationKey="contact.team_body" fallback="Send the Ponyo team a note. We’ll reply to the email address you share." /></p></div></div>
        <div className="contact-help-links">
          <Link href="/pages/faq"><span className="contact-help-icon" aria-hidden="true">?</span><span><strong><LocalizedText translationKey="contact.faq" fallback="A quick answer might be waiting" /></strong><small><LocalizedText translationKey="contact.faq_body" fallback="Explore delivery, sizing, and care in our FAQs." /></small><b><LocalizedText translationKey="contact.faq_cta" fallback="Explore FAQs" /> <span aria-hidden="true">↗</span></b></span></Link>
          <Link href="/orders"><span className="contact-help-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10M8 5l8 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg></span><span><strong><LocalizedText translationKey="contact.orders" fallback="Your order, close at hand" /></strong><small><LocalizedText translationKey="contact.orders_body" fallback="Check your order history before sending an order question." /></small><b><LocalizedText translationKey="contact.orders_cta" fallback="View your orders" /> <span aria-hidden="true">↗</span></b></span></Link>
        </div>
      </section>
      <LocalContactForm />
    </div>
  </div>;
}

function PartnerPage() {
  return (
    <div className="store-container contact-page partner-page">
      <section className="partner-page-hero">
        <span className="account-auth-eyebrow">MADE FOR FOREVER PLUSH</span>
        <h1>Let’s make room for your creations.</h1>
        <p>We partner with thoughtful plush makers and character brands. Tell us about your work and what you have in mind.</p>
      </section>
      <section className="partner-page-content" aria-labelledby="partner-form-title">
        <div className="partner-page-note">
          <h2 id="partner-form-title">Start a conversation</h2>
          <p>Share your product range, studio, and partnership idea. Your inquiry is saved directly to Ponyo’s local system.</p>
          <ul><li>Independent makers and established brands welcome</li><li>Limited editions and distinctive characters are a plus</li><li>Include a website or social link so we can see your work</li></ul>
        </div>
        <PartnerInquiryForm />
      </section>
    </div>
  );
}

type Query = Record<string, string | string[] | undefined>;
const firstQueryValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

async function DominaPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const minimumParam = firstQueryValue(query.min)?.trim();
  const maximumParam = firstQueryValue(query.max)?.trim();
  const minimumValue = Number(minimumParam);
  const maximumValue = Number(maximumParam);
  const minimum = minimumParam && Number.isFinite(minimumValue) ? Math.max(0, minimumValue) : 0;
  const maximum = maximumParam && Number.isFinite(maximumValue) ? Math.max(0, maximumValue) : Number.POSITIVE_INFINITY;
  const size = firstQueryValue(query.size) ?? "";
  const availability = firstQueryValue(query["filter.v.availability"]) ?? "";
  const sort = firstQueryValue(query.sort_by) ?? "featured";
  const allProducts = (await getLocalizedProducts()).filter((product) => product.tags?.includes("domina-xl"));
  const products = allProducts.filter((product) => {
    const productSize = (product.sizeTier ?? product.size ?? "").toLowerCase();
    const sizeMatches = !size || productSize.startsWith(size.toLowerCase());
    return product.priceAmount >= minimum && product.priceAmount <= maximum && sizeMatches && (!availability || availability !== "1" || product.availability === "available");
  }).sort((a, b) => {
    const publishedAtA = Date.parse(a.publishedAt ?? "") || 0;
    const publishedAtB = Date.parse(b.publishedAt ?? "") || 0;
    if (sort === "price-ascending") return a.priceAmount - b.priceAmount;
    if (sort === "price-descending") return b.priceAmount - a.priceAmount;
    if (sort === "title-descending") return b.name.localeCompare(a.name);
    if (sort === "title-ascending") return a.name.localeCompare(b.name);
    if (sort === "created-ascending") return publishedAtA - publishedAtB;
    if (sort === "created-descending") return publishedAtB - publishedAtA;
    return 0;
  });
  const preservedFilters = {
    ...(size ? { size } : {}),
    ...(minimum ? { min: String(minimum) } : {}),
    ...(Number.isFinite(maximum) ? { max: String(maximum) } : {}),
    ...(availability ? { "filter.v.availability": availability } : {}),
  };
  return <div className="domina-page">
    <section className="domina-page-hero">
      <div className="domina-page-hero-copy">
        <span className="domina-hero-kicker"><span aria-hidden="true">✦</span> PONYO SIGNATURE COLLECTION <span aria-hidden="true">✦</span></span>
        <h1>Domina <em>XL</em></h1>
        <p>Meet the plush that makes every room feel a little more magical. Big on softness, unmistakably Ponyo.</p>
        <div className="domina-hero-facts"><span><strong>60–120 cm</strong><small>made for giant hugs</small></span><i aria-hidden="true">✦</i><span><strong>One-of-a-kind</strong><small>your new favorite company</small></span></div>
        <Link className="domina-hero-cta" href="#domina-products">Meet your giant plush <span aria-hidden="true">↘</span></Link>
      </div>
      <div className="domina-hero-seal" role="img" aria-label="Ponyo Signature XL edition"><span>THE PONYO</span><strong>XL</strong><span>SIGNATURE EDITION</span></div>
      <Image src="/images/catalog/ponyo-3.png" alt="An oversized bunny plush shown beside a person for scale" fill priority sizes="(max-width: 700px) 100vw, 52vw"/>
    </section>
    <section className="domina-trust store-container" aria-label="Domina XL details">{[["↕", "See the scale", "Every listing shows its full height, so you can picture it at home."], ["♡", "Product details", "Clear size, materials and care details on every plush."], ["¥", "Compare prices", "Compare prices in your currency before checkout."], ["↗", "Delivery info", "See XL delivery options and estimates for your destination."]].map(([icon, title, text]) => <article key={title}><span>{icon}</span><h2>{title}</h2><p>{text}</p></article>)}</section>
    <section className="store-container domina-products" id="domina-products">
      <header className="domina-products-heading">
        <div><p className="eyebrow">THE PONYO XL EDITION</p><h2>XL Goodies</h2></div>
        <p>Extra-large plush, chosen for their extra-large place in your heart.</p>
      </header>
      <div className="domina-catalog-toolbar"><form className="domina-catalog-filters" action="/pages/domina-xl" method="get"><input type="hidden" name="sort_by" value={sort} /><label>Size<select name="size" defaultValue={size}><option value="">Any size</option>{["Small", "Medium", "Large", "XL", "Giant"].map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select></label><label>Price from ¥<input type="number" name="min" min="0" defaultValue={minimum || ""} placeholder="0" /></label><label>To ¥<input type="number" name="max" min="0" defaultValue={Number.isFinite(maximum) ? maximum : ""} placeholder="No limit" /></label><label className="domina-stock-filter"><input type="checkbox" name="filter.v.availability" value="1" defaultChecked={availability === "1"} /> In stock</label><button type="submit">Filter <span aria-hidden="true">→</span></button></form><span className="domina-catalog-count">{products.length} {products.length === 1 ? "plush" : "plushies"}</span><SortSelect action="/pages/domina-xl" value={sort} category="" search="" preservedFilters={preservedFilters} options={dominaSortOptions} /></div>
      <ProductGrid products={products}/>
      {products.length === 0 && <p className="empty-collection">No plush matches those filters. <Link href="/pages/domina-xl">Clear filters</Link></p>}
    </section>
  </div>;
}

export default async function ContentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Query> }) {
  const { slug } = await params;
  if (slug === "about") return <SiteFrame className="store-page"><AboutPage/></SiteFrame>;
  if (slug === "faq") return <SiteFrame className="store-page"><FaqPage/></SiteFrame>;
  if (slug === "contact") return <SiteFrame className="store-page"><ContactPage/></SiteFrame>;
  if (slug === "partners") return <SiteFrame className="store-page"><PartnerPage /></SiteFrame>;
  if (slug === "domina-xl") return <SiteFrame className="store-page"><DominaPage searchParams={searchParams} /></SiteFrame>;
  notFound();
}
