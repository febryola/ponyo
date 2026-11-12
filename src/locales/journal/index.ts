import type { JournalArticle } from "@/app/blogs/journal-articles";
import { articles as es } from "./es";
import { articles as id } from "./id";
import { articles as ja } from "./ja";
import { articles as ko } from "./ko";
import { articles as zh } from "./zh-CN";
import type { JournalArticleTranslation } from "./types";

export const journalTranslations: Record<string, Record<string, JournalArticleTranslation>> = { es, id, ja, ko, "zh-CN": zh };

export function localizeJournalArticle(article: JournalArticle, language: string): JournalArticle {
  const translation = journalTranslations[language]?.[article.slug];
  if (!translation) return article;
  const { shopCollectionTitle, ...copy } = translation;
  return { ...article, ...copy, shopCollection: { ...article.shopCollection, title: shopCollectionTitle } };
}