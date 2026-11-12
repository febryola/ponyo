import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { JournalReveal } from "@/components/journal/journal-reveal";
import { ProductGrid } from "@/components/product/product-grid";
import { getLocalizedProducts } from "@/services/localized-products.server";
import { getJournalArticle, journalArticles } from "@/app/blogs/journal-articles";
import { localizeJournalArticle } from "@/locales/journal";
import { journalCollectionTerms } from "@/locales/journal-ui";
import { getJournalLocalization } from "@/services/journal-localization.server";

const allowedBlogs = new Set(["news", "journal"]);

const collectionLinks: Record<string, string> = {
  "New Arrivals": "/collections/new-arrivals",
  "Premium Plush": "/collections/premium",
  "Rare Finds": "/collections/rare-finds",
  "Domina XL collection": "/collections/domina-xl",
  "all plush": "/collections/all",
};

function ArticleText({ text, locale }: { text: string; locale: string }) {
  const terms = journalCollectionTerms[locale] ?? journalCollectionTerms.en;
  const links = Object.fromEntries(terms.map((term, index) => [term, Object.values(collectionLinks)[index]]));
  const pattern = new RegExp(`(${[...terms].sort((a, b) => b.length - a.length).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text.split(pattern).map((part, index) => (
    links[part] ? <Link href={links[part]} key={index}>{part}</Link> : part
  ));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string; article: string }> }): Promise<Metadata> {
  const { handle, article: articleSlug } = await params;
  const article = allowedBlogs.has(handle) ? getJournalArticle(articleSlug) : undefined;
  const { locale, ui } = await getJournalLocalization();
  const localized = article ? localizeJournalArticle(article, locale) : undefined;
  return localized ? { title: `${localized.title} | ${ui("title")}`, description: localized.excerpt } : { title: `${ui("notFound")} | ${ui("title")}` };
}

export default async function JournalArticlePage({ params }: { params: Promise<{ handle: string; article: string }> }) {
  const { handle, article: articleSlug } = await params;
  if (!allowedBlogs.has(handle)) notFound();
  const sourceArticle = getJournalArticle(articleSlug);
  if (!sourceArticle) notFound();
  const { locale, ui, formatDate } = await getJournalLocalization();
  const article = localizeJournalArticle(sourceArticle, locale);

  const allProducts = await getLocalizedProducts();
  const relatedProducts = allProducts.filter((product) => {
    const searchable = `${product.categoryName} ${product.sizeTier ?? ""} ${product.tags?.join(" ") ?? ""}`.toLowerCase();
    return article.shopCollection.matchTags.some((tag) => searchable.includes(tag));
  }).slice(0, 4);
  const recommendations = relatedProducts.length ? relatedProducts : allProducts.slice(0, 4);
  const date = formatDate(article.date);
  // Use the source word count so CJK text is not counted as a single word.
  const articleText = [...sourceArticle.introduction, ...sourceArticle.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])])].join(" ");
  const readMinutes = Math.max(1, Math.ceil(articleText.split(/\s+/).length / 200));
  const otherArticles = journalArticles.filter((item) => item.slug !== article.slug).map((item) => localizeJournalArticle(item, locale));

  return (
    <SiteFrame className="store-page journal-article-page">
      <JournalReveal>
      <div className="journal-article-shell">
        <section className="journal-article-hero" aria-labelledby="journal-article-title">
          <div className="journal-article-copy">
            <nav className="journal-breadcrumb" aria-label={ui("breadcrumb")}><Link href="/">{ui("home")}</Link><span aria-hidden="true">›</span><Link href={`/blogs/${handle}`}>{ui("title")}</Link></nav>
            <span className="journal-article-kicker">{article.label}</span>
            <h1 id="journal-article-title">{article.title}</h1>
            <p className="journal-article-excerpt">{article.excerpt}</p>
            <div className="journal-article-meta"><span>◷ {ui("readTime", undefined, { minutes: new Intl.NumberFormat(locale).format(readMinutes) })}</span><time dateTime={article.date}>{date}</time>{article.tags.slice(0, 3).map((tag) => <span className="journal-tag" key={tag}>#{tag}</span>)}</div>
            <p className="journal-article-author">{ui("byAuthor", undefined, { author: article.author })}</p>
          </div>
          <div className="journal-article-image"><Image src={article.image} alt={article.imageAlt} fill priority sizes="(min-width: 768px) 46vw, 100vw" /></div>
        </section>

        <article className="journal-prose">
          {article.introduction.map((paragraph) => <p key={paragraph} data-journal-reveal>{paragraph}</p>)}
          {article.sections.map((section) => <section className={`journal-prose-section${/^\d+\./.test(section.heading) ? " journal-prose-step" : ""}`} key={section.heading}>
              <h2 data-journal-reveal>{section.heading.replace(/^\d+\.\s*/, "")}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph} data-journal-reveal><ArticleText text={paragraph} locale={locale} /></p>)}
              {section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet} data-journal-reveal>{bullet}</li>)}</ul>}
            </section>)}
          <p className="journal-signoff" data-journal-reveal>{ui("signoff")} <strong>{ui("team")}</strong></p>
        </article>

        {recommendations.length > 0 && <section className="journal-shop-story" aria-labelledby="journal-shop-story-title">
          <div className="journal-shop-story-heading" data-journal-reveal><div><span>{ui("continues")}</span><h2 id="journal-shop-story-title">{ui("explore")}</h2></div><Link href={`/collections/${article.shopCollection.slug}`}>{ui("shop", undefined, { collection: article.shopCollection.title })} <span aria-hidden="true">→</span></Link></div>
          <div data-journal-reveal><ProductGrid products={recommendations} compact /></div>
        </section>}

        <section className="journal-keep-reading" aria-labelledby="journal-keep-reading-title"><h2 id="journal-keep-reading-title" data-journal-reveal>{ui("keepReading")}</h2><div className="journal-related-grid">{otherArticles.map((item) => <Link className="journal-related-card" href={`/blogs/${handle}/${item.slug}`} key={item.slug} data-journal-reveal><span className="journal-related-image"><Image src={item.image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" /></span><span className="journal-related-copy"><small>{item.label}</small><strong>{item.title}</strong><b>{ui("readStory")}</b></span></Link>)}</div></section>
      </div>
      </JournalReveal>
    </SiteFrame>
  );
}
