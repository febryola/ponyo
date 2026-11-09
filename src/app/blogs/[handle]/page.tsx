import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import locale from "@/ponyo-shopify/locales/en.default.json";
import { journalArticles } from "../journal-articles";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: handle === "news" ? "The Plush Journal" : `${handle} | The Plush Journal` };
}

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
        <header className="journal-list-heading"><div><span>✦ THE LATEST FROM PONYO</span><h2 id="journal-articles-heading">Stories to keep close</h2></div><p>Thoughtful guides for choosing, styling, and caring for the plush you love.</p></header>
        <div className="journal-card-grid">
          {journalArticles.map((article) => {
            const date = new Date(`${article.date}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
            return <Link className="journal-card" href={`/blogs/${handle}/${article.slug}`} key={article.slug}>
              <span className="journal-card-image"><Image src={article.image} alt={article.imageAlt} fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" /></span>
              <span className="journal-card-copy"><span className="journal-card-label">{article.label}</span><strong>{article.title}</strong><span className="journal-card-meta"><time dateTime={article.date}>{date}</time><span>·</span>{article.author}</span><span className="journal-card-excerpt">{article.excerpt}</span><b>{locale.home.pages.journal_read}</b></span>
            </Link>;
          })}
        </div>
      </section>
    </SiteFrame>
  );
}