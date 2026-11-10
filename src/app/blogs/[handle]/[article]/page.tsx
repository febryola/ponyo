import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { ProductGrid } from "@/components/product/product-grid";
import { getLocalizedProducts } from "@/services/localized-products.server";
import { getJournalArticle, journalArticles } from "../../journal-articles";

const allowedBlogs = new Set(["news", "journal"]);

export async function generateMetadata({ params }: { params: Promise<{ handle: string; article: string }> }): Promise<Metadata> {
  const { handle, article: articleSlug } = await params;
  const article = allowedBlogs.has(handle) ? getJournalArticle(articleSlug) : undefined;
  return article ? { title: `${article.title} | The Plush Journal`, description: article.excerpt } : { title: "Story not found | The Plush Journal" };
}

export default async function JournalArticlePage({ params }: { params: Promise<{ handle: string; article: string }> }) {
  const { handle, article: articleSlug } = await params;
  if (!allowedBlogs.has(handle)) notFound();
  const article = getJournalArticle(articleSlug);
  if (!article) notFound();

  const allProducts = await getLocalizedProducts();
  const relatedProducts = allProducts.filter((product) => {
    const searchable = `${product.categoryName} ${product.tags?.join(" ") ?? ""}`.toLowerCase();
    return article.tags.some((tag) => searchable.includes(tag.toLowerCase()));
  }).slice(0, 4);
  const recommendations = relatedProducts.length ? relatedProducts : allProducts.slice(0, 4);
  const date = new Date(`${article.date}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const readMinutes = Math.max(1, Math.ceil(article.sections.reduce((wordCount, section) => wordCount + section.paragraphs.join(" ").split(/\s+/).length, 0) / 200));
  const otherArticles = journalArticles.filter((item) => item.slug !== article.slug);

  return (
    <SiteFrame className="store-page journal-article-page">
      <div className="journal-article-shell">
        <section className="journal-article-hero" aria-labelledby="journal-article-title">
          <div className="journal-article-copy">
            <nav className="journal-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">›</span><Link href={`/blogs/${handle}`}>The Plush Journal</Link></nav>
            <span className="journal-article-kicker">{article.label}</span>
            <h1 id="journal-article-title">{article.title}</h1>
            <p className="journal-article-excerpt">{article.excerpt}</p>
            <div className="journal-article-meta"><span>◷ {readMinutes} min read</span><time dateTime={article.date}>{date}</time>{article.tags.slice(0, 3).map((tag) => <span className="journal-tag" key={tag}>#{tag}</span>)}</div>
            <p className="journal-article-author">By {article.author}</p>
          </div>
          <div className="journal-article-image"><Image src={article.image} alt={article.imageAlt} fill priority sizes="(min-width: 768px) 46vw, 100vw" /></div>
        </section>

        <article className="journal-prose">
          {article.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}</section>)}
          <p className="journal-signoff">Softly yours, <strong>The Ponyo team</strong></p>
        </article>

        {recommendations.length > 0 && <section className="journal-shop-story" aria-labelledby="journal-shop-story-title"><div className="journal-shop-story-heading"><div><span>✦ THE STORY CONTINUES</span><h2 id="journal-shop-story-title">A few plush to explore</h2></div><Link href="/collections/all">Shop all plush <span aria-hidden="true">→</span></Link></div><ProductGrid products={recommendations} compact /></section>}

        <section className="journal-keep-reading" aria-labelledby="journal-keep-reading-title"><h2 id="journal-keep-reading-title">Keep reading</h2><div className="journal-related-grid">{otherArticles.map((item) => <Link className="journal-related-card" href={`/blogs/${handle}/${item.slug}`} key={item.slug}><span className="journal-related-image"><Image src={item.image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" /></span><span className="journal-related-copy"><small>{item.label}</small><strong>{item.title}</strong><b>{item === otherArticles[0] ? "Read the story" : "Read the guide"} →</b></span></Link>)}</div></section>
      </div>
    </SiteFrame>
  );
}
