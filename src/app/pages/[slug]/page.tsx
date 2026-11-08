import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { LocalContactForm } from "@/components/layout/local-store-forms";
import { PartnerInquiryForm } from "@/components/layout/partner-inquiry-form";
import { ProductGrid } from "@/components/product/product-grid";
import { getProducts } from "@/services/product.service";
import locale from "@/ponyo-shopify/locales/en.default.json";

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

function Breadcrumb({ title }: { title: string }) {
  return <nav className="store-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>›</span><span aria-current="page">{title}</span></nav>;
}

function AboutPage() {
  return <>
    <section className="content-page store-container about-page">
      <Breadcrumb title={about.title} />
      <div className="about-hero"><div><span className="about-eyebrow">{about.eyebrow}</span><h1>{about.heading} <em>{about.heading_accent}</em></h1><p>{about.intro}</p><p>{about.intro2}</p><div className="about-actions"><Link className="shop-button shop-button-orange" href="/shop">{about.cta_shop}</Link><Link className="about-secondary-button" href="/pages/domina-xl">{about.cta_domina}</Link></div></div><Image src="https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-5.png?v=1793843377" alt="Soft plush toys gathered together" width={600} height={700} priority /></div>
      <h2 className="about-section-title">{about.promise_title}</h2><div className="about-promise-grid">{[[about.v1_title, about.v1_body, "♡"], [about.v2_title, about.v2_body, "⌕"], [about.v3_title, about.v3_body, "↕"]].map(([title, body, icon]) => <article key={title}><span>{icon}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
      <h2 className="about-section-title">Shop by size</h2><div className="about-size-grid">{sizeRows.map(([name, range, href]) => <Link href={href} key={name}><strong>{name}</strong><span>{range}</span></Link>)}</div>
      <section className="about-closing"><h2>{about.closing_title}</h2><p>{about.closing_body}</p><Link className="shop-button shop-button-orange" href="/shop">{about.cta_shop}</Link></section>
    </section>
  </>;
}

function FaqPage() {
  return <div className="store-container faq-page">
    <header className="faq-page-header"><Breadcrumb title={faq.title} /><h1>{faq.title}</h1><p>{faq.sub}</p><nav aria-label={faq.topics}>{faqGroups.map((group) => <a href={`#faq-${group.id}`} key={group.id}>{group.title}</a>)}</nav></header>
    <div className="faq-page-groups">{faqGroups.map((group) => <section id={`faq-${group.id}`} key={group.id} className="faq-topic"><h2>{group.title}</h2><div>{group.questions.map(([question, answer], index) => <details key={question} open={group.id === "ordering" && index === 0}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div>{group.id === "sizes" && <div className="faq-size-table"><table><caption className="sr-only">Ponyo plush size ranges</caption><tbody>{sizeRows.map(([name, range]) => <tr key={name}><th scope="row">{name}</th><td>{range}</td></tr>)}</tbody></table></div>}</section>)}</div>
    <section className="faq-contact-cta"><h2>{faq.contact_title}</h2><p>{faq.contact_body}</p><Link className="shop-button shop-button-orange" href="/pages/contact">{faq.contact_cta}</Link></section>
  </div>;
}

function ContactPage() {
  return <div className="store-container contact-page"><Breadcrumb title="Contact Ponyo"/><div className="contact-layout"><div><h1>How can we help?</h1><p>Questions about an order, delivery, or finding a plush? Send us a note and the Ponyo team will get back to you.</p></div><LocalContactForm /></div></div>;
}

function PartnerPage() {
  return (
    <div className="store-container contact-page partner-page">
      <Breadcrumb title="Partner with Ponyo" />
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

async function DominaPage() {
  const products = (await getProducts()).filter((product) => product.tags?.includes("domina-xl"));
  return <div className="domina-page">
    <section className="domina-page-hero"><div className="domina-page-hero-copy"><span>OVERSIZED PLUSH</span><h1>Domina XL</h1><p>Oversized plush companions that bring comfort, character, and a little wonder into your space.</p><a href="#domina-products">Shop Domina XL →</a></div><Image src="https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-3.png?v=1793843376" alt="An oversized bunny plush shown beside a person for scale" fill priority sizes="(max-width: 700px) 100vw, 52vw"/></section>
    <section className="domina-trust store-container" aria-label="Domina XL details">{[["↕", "See the scale", "Every Domina XL listing shows its full height so you can picture it in your room before it arrives."], ["♡", "Product details", "Sizes from 60 cm to 120 cm, with materials and care listed on each plush."], ["¥", "Compare prices", "Prices are shown in your currency, with duties confirmed before checkout."], ["↗", "Delivery info", "XL plush ship in large-format boxes. Options and estimates depend on your destination."]].map(([icon, title, text]) => <article key={title}><span>{icon}</span><h2>{title}</h2><p>{text}</p></article>)}</section>
    <section className="store-container domina-products" id="domina-products"><header><p className="eyebrow">Big plush, memorable presence</p><h2>XL Goodies</h2></header><ProductGrid products={products}/></section>
  </div>;
}

export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "about") return <SiteFrame className="store-page"><AboutPage/></SiteFrame>;
  if (slug === "faq") return <SiteFrame className="store-page"><FaqPage/></SiteFrame>;
  if (slug === "contact") return <SiteFrame className="store-page"><ContactPage/></SiteFrame>;
  if (slug === "partners") return <SiteFrame className="store-page"><PartnerPage /></SiteFrame>;
  if (slug === "domina-xl") return <SiteFrame className="store-page"><DominaPage /></SiteFrame>;
  notFound();
}
