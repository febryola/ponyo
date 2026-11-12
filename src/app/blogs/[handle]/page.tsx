import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { JournalReveal } from "@/components/journal/journal-reveal";
import { journalArticles } from "@/app/blogs/journal-articles";
import { localizeJournalArticle } from "@/locales/journal";
import { getJournalLocalization } from "@/services/journal-localization.server";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const { ui } = await getJournalLocalization();
  return { title: handle === "news" || handle === "journal" ? ui("title") : `${handle} | ${ui("title")}`, description: ui("subtitle") };
}

export default async function JournalPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (handle !== "news" && handle !== "journal") notFound();

  const { locale, ui, formatDate } = await getJournalLocalization();
  const articles = journalArticles.map((article) => localizeJournalArticle(article, locale));

  return (
    <SiteFrame className="store-page journal-page">
      <JournalReveal>
      <section className="journal-hero store-container" aria-labelledby="journal-heading">
        <div className="journal-hero-copy">
          <span>{ui("eyebrow")}</span>
          <h1 id="journal-heading">{ui("title")}</h1>
          <p>{ui("subtitle")}</p>
          <nav className="journal-topic-links" aria-label={ui("topics")}>
            {articles.map((article) => <Link href={`/blogs/${handle}/${article.slug}`} key={article.slug}>{article.label}<span aria-hidden="true">↗</span></Link>)}
          </nav>
          <span className="journal-hero-note">{ui("heroNote")}</span>
        </div>
        <div className="journal-hero-image">
          <Image src="/images/catalog/ponyo-2.png" alt={ui("heroAlt")} fill priority sizes="(min-width: 768px) 50vw, 100vw" />
        </div>
      </section>

      <section className="journal-list store-container" aria-labelledby="journal-articles-heading">
        <header className="journal-list-heading"><div><span>{ui("latest")}</span><h2 id="journal-articles-heading">{ui("storiesTitle")}</h2></div><span className="journal-story-count">{ui("storyCount", undefined, { count: new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(articles.length) })}</span></header>
        <div className="journal-card-grid">
          {articles.map((article) => {
            const date = formatDate(article.date);
            return <Link className="journal-card" href={`/blogs/${handle}/${article.slug}`} key={article.slug} data-journal-reveal>
              <span className="journal-card-image"><Image src={article.image} alt={article.imageAlt} fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" /></span>
              <span className="journal-card-copy"><span className="journal-card-label">{article.label}</span><strong>{article.title}</strong><span className="journal-card-meta"><time dateTime={article.date}>{date}</time><span>·</span>{article.author}</span><span className="journal-card-excerpt">{article.excerpt}</span><b>{ui("readGuide")}</b></span>
            </Link>;
          })}
        </div>
      </section>
      </JournalReveal>
    </SiteFrame>
  );
}