export type JournalArticleTranslation = {
  label: string;
  title: string;
  excerpt: string;
  imageAlt: string;
  tags: string[];
  introduction: string[];
  shopCollectionTitle: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
};