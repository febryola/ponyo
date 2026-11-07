import Image from "next/image";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import locale from "@/ponyo-shopify/locales/en.default.json";

const journalCards = [
  {
    image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-3.png?v=1793843376",
    alt: "An oversized bunny plush shown beside a person for scale",
    label: locale.home.journal.card1_label,
    title: locale.home.journal.card1_title,
    cta: locale.home.journal.card1_cta,
  },
  {
    image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-5.png?v=1793843377",
    alt: "Close-up details of a soft teddy bear plush",
    label: locale.home.journal.card2_label,
    title: locale.home.journal.card2_title,
    cta: locale.home.journal.card2_cta,
  },
  {
    image: "https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-6.png?v=1793843378",
    alt: "A selection of plush characters arranged together",
    label: locale.home.journal.card3_label,
    title: locale.home.journal.card3_title,
    cta: locale.home.journal.card3_cta,
  },
];

export const metadata = { title: "The Plush Journal" };

export default async function JournalPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (handle !== "news" && handle !== "journal") notFound();

  const copy = locale.home.pages;

  return (
    <SiteFrame className="store-page journal-page">
      <section className="journal-hero store-container" aria-labelledby="journal-heading">
        <div className="journal-hero-copy">
          <span>{copy.journal_eyebrow}</span>
          <h1 id="journal-heading">{copy.journal_title}</h1>
          <p>{copy.journal_sub}</p>
        </div>
        <div className="journal-hero-image">
          <Image src="https://ponyo-plushies.myshopify.com/cdn/shop/files/ponyo-2.png?v=1793843375" alt="A selection of plush characters arranged together" fill priority sizes="(min-width: 768px) 50vw, 100vw" />
        </div>
      </section>

      <section className="journal-list store-container" aria-labelledby="journal-articles-heading">
        <h2 className="sr-only" id="journal-articles-heading">Articles</h2>
        <div className="journal-card-grid">
          {journalCards.map((card) => (
            <article className="journal-card" key={card.title}>
              <Image src={card.image} alt={card.alt} fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" />
              <span className="journal-card-shade" aria-hidden="true" />
              <div className="journal-card-copy">
                <span>{card.label}</span>
                <h2>{card.title}</h2>
                <b>{card.cta}</b>
              </div>
            </article>
          ))}
        </div>
      </section>
    </SiteFrame>
  );
}