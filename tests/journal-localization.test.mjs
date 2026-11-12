import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(path, imports = {}) {
  const context = { exports: {}, Intl, require: (id) => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected import ${id}`);
    return imports[id];
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const { journalArticles } = load("../src/app/blogs/journal-articles.ts");
const locales = ["es", "id", "ja", "ko", "zh-CN"];
const imports = Object.fromEntries(locales.map((locale) => [`./${locale}`, load(`../src/locales/journal/${locale}.ts`)]));
const { localizeJournalArticle } = load("../src/locales/journal/index.ts", imports);
const { journalUI } = load("../src/locales/journal-ui.ts");

for (const language of locales) {
  test(`${language}: every journal article has complete translated paragraphs, headings and bullets`, () => {
    const translated = imports[`./${language}`].articles;
    assert.deepEqual(Object.keys(translated).sort(), Array.from(journalArticles, (a) => a.slug).sort());
    for (const original of journalArticles) {
      const article = localizeJournalArticle(original, language);
      for (const key of ["label", "title", "excerpt", "imageAlt"]) {
        assert.ok(article[key].trim());
        assert.notEqual(article[key], original[key]);
      }
      assert.equal(article.slug, original.slug);
      assert.equal(article.image, original.image);
      assert.equal(article.date, original.date);
      assert.equal(article.shopCollection.slug, original.shopCollection.slug);
      assert.equal(article.introduction.length, original.introduction.length);
      assert.equal(article.sections.length, original.sections.length);
      article.introduction.forEach((text, index) => assert.notEqual(text, original.introduction[index]));
      article.sections.forEach((section, index) => {
        const source = original.sections[index];
        assert.equal(section.heading.match(/^\d+\./)?.[0], source.heading.match(/^\d+\./)?.[0]);
        assert.equal(section.paragraphs.length, source.paragraphs.length);
        section.paragraphs.forEach((text, i) => { assert.ok(text.trim()); assert.notEqual(text, source.paragraphs[i]); });
        assert.equal(section.bullets?.length ?? 0, source.bullets?.length ?? 0);
        section.bullets?.forEach((text, i) => assert.notEqual(text, source.bullets[i]));
      });
    }
  });
  test(`${language}: journal interface keys and placeholders match English`, () => {
    assert.deepEqual(Object.keys(journalUI[language]).sort(), Object.keys(journalUI.en).sort());
    for (const [key, text] of Object.entries(journalUI.en)) {
      assert.deepEqual(journalUI[language][key].match(/\{\w+\}/g) ?? [], text.match(/\{\w+\}/g) ?? []);
    }
  });
}

test("English and unsupported journal locales retain canonical copy and alias identity", () => {
  for (const article of journalArticles) {
    assert.equal(localizeJournalArticle(article, "en"), article);
    assert.equal(localizeJournalArticle(article, "unknown"), article);
  }
});

test("journal server locale validates cookies and localizes Japanese/Korean dates", async () => {
  const { languages } = load("../src/lib/localization-options.ts");
  for (const [cookie, expected] of [["ja", "ja"], ["ko", "ko"], ["invalid", "en"], [undefined, "en"]]) {
    const { getJournalLocalization } = load("../src/services/journal-localization.server.ts", {
      "server-only": {},
      "next/headers": { cookies: async () => ({ get: () => ({ value: cookie }) }) },
      "@/lib/localization-options": { languages },
      "@/locales/journal-ui": { journalUI },
    });
    const { locale, ui, formatDate } = await getJournalLocalization();
    assert.equal(locale, expected);
    assert.ok(!ui("readTime", undefined, { minutes: 3 }).includes("{minutes}"));
    if (locale === "ja") assert.match(formatDate("2026-11-05"), /2026年11月5日/);
    if (locale === "ko") assert.match(formatDate("2026-11-05"), /2026년 11월 5일/);
  }
});