import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const dashboard = readFileSync(new URL("../src/components/account/account-dashboard.tsx", import.meta.url), "utf8");
const translationSource = readFileSync(new URL("../src/locales/account-translations.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(translationSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const translationContext = { exports: {} };
vm.runInNewContext(compiled, translationContext);
const translations = translationContext.exports.accountTranslations;

test("signed-in dashboard includes honest shop-again and returns-help destinations", () => {
  assert.match(dashboard, /account-shop-again-tile" href="\/collections\/all"/);
  assert.match(dashboard, /account\.shop_title", "Shop again"/);
  assert.match(dashboard, /account-returns-tile" href="\/pages\/contact"/);
  assert.match(dashboard, /account\.returns_title", "Returns & order help"/);
  assert.match(dashboard, /account\.orders_title", "Orders & tracking"/);
  assert.match(dashboard, /account-buy-again-tile/);
  assert.match(dashboard, /refreshCartItems\(proposed, currency\)/);
  assert.match(dashboard, /line\.priceChanged/);
  assert.match(dashboard, /!checked\.validation\.canCheckout/);
  assert.match(dashboard, /\{recentOrder && <article className="account-overview-tile account-buy-again-tile"/);
});

test("marketplace shortcut copy is reviewed in all supported non-English locales", () => {
  const requiredKeys = [
    "account.shop_title",
    "account.shop_body",
    "account.returns_title",
    "account.returns_body",
    "account.orders_title",
    "account.orders_unavailable",
    "account.reorder_title",
    "account.reorder_body",
    "account.reorder_button",
    "account.reorder_review",
  ];
  for (const locale of ["es", "id", "ja", "ko", "zh-CN"]) {
    for (const key of requiredKeys) {
      assert.equal(typeof translations[locale]?.[key], "string", `${locale} is missing ${key}`);
    }
  }
  for (const locale of ["es", "id", "ja", "ko", "zh-CN"]) {
    assert.match(translations[locale]["account.order_count_many"], /\{\{count\}\}/);
  }
});
