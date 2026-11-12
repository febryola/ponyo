import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (text) => ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const dictionaryContext = { exports: {} };
const dictionarySource = read("src/locales/checkout-translations.ts");
vm.runInNewContext(compile(dictionarySource), dictionaryContext);
const translations = dictionaryContext.exports.checkoutTranslations;
const locales = ["en", "es", "id", "ja", "ko", "zh-CN"];
const sourceText = read("src/components/layout/checkout-page-client.tsx");
const source = ts.createSourceFile("checkout.tsx", sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const calls = [];
function walk(node, visit) { visit(node); ts.forEachChild(node, (child) => walk(child, visit)); }
walk(source, (node) => {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "t") calls.push(node);
});
const fallbacks = Object.fromEntries(calls.map(({ arguments: args }) => [args[0].text, args[1].text]));
const placeholders = (value) => [...value.matchAll(/\{\{\s*\w+\s*\}\}/g)].map(([token]) => token).sort();
const translate = (language, key, fallback, values = {}) => (translations[language]?.[key] ?? fallback)
  .replace(/\{\{\s*(\w+)\s*\}\}/g, (token, name) => String(values[name] ?? token));

test("every checkout call has an exact literal fallback and all five reviewed dictionaries have matching keys", () => {
  const keys = Object.keys(fallbacks).sort();
  assert.ok(keys.length > 100, "Cover the complete checkout, not just its headings");
  assert.deepEqual(Object.keys(translations).sort(), locales.slice(1).sort());
  for (const call of calls) {
    const [key, fallback, values] = call.arguments;
    assert.ok(ts.isStringLiteral(key) && key.text.startsWith("checkout."));
    assert.ok(ts.isStringLiteral(fallback) && fallback.text.trim(), key.text);
    assert.equal(fallback.text, fallbacks[key.text], `Conflicting fallback: ${key.text}`);
    const tokens = placeholders(fallback.text);
    if (tokens.length) {
      assert.ok(values && ts.isObjectLiteralExpression(values), key.text);
      assert.deepEqual(values.properties.map((property) => property.name.getText(source)).sort(),
        tokens.map((token) => token.match(/\w+/)[0]).sort(), key.text);
    }
  }
  for (const locale of locales.slice(1)) {
    assert.deepEqual(Object.keys(translations[locale]).sort(), keys, locale);
    for (const [key, value] of Object.entries(translations[locale])) {
      assert.ok(typeof value === "string" && value.trim(), `${locale}:${key}`);
      assert.equal(value, value.trim());
      assert.doesNotMatch(value, /\uFFFD/);
      assert.deepEqual(placeholders(value), placeholders(fallbacks[key]), `${locale}:${key}`);
      assert.doesNotMatch(value.replace(/\{\{\s*\w+\s*\}\}/g, ""), /[{}]/);
      assert.doesNotMatch(translate(locale, key, fallbacks[key], { count: 2, code: "SAVE10", rate: 10, currency: "USD", payment: "Visa" }), /\{\{|undefined/);
    }
  }
  const rowKeys = [...dictionarySource.matchAll(/^  \["([^"]+)"/gm)].map((match) => match[1]);
  assert.equal(new Set(rowKeys).size, rowKeys.length, "Duplicate translation row");
});

test("visible JSX copy, accessible names and placeholders are wired; trademark SVG artwork is unchanged", () => {
  walk(source, (node) => {
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text)) {
      assert.equal(node.parent.openingElement?.tagName.getText(source), "text", node.text.trim());
    }
    if (ts.isJsxAttribute(node) && ["placeholder", "aria-label", "title"].includes(node.name.getText(source))) {
      assert.ok(!node.initializer || !ts.isStringLiteral(node.initializer), node.getText(source));
    }
  });
  assert.match(sourceText, /const \{ t, language,/);
  assert.match(sourceText, /value=\{item.label\}>\{regionName\(item.code, language, item.label\)\}/);
  assert.match(sourceText, /item.label === checkoutDelivery.country/);
  assert.match(sourceText, /error instanceof Error \? error.message/);
  assert.equal(fallbacks["checkout.shipping_standard_days"], "5–8 business days");
  assert.equal(fallbacks["checkout.shipping_express_days"], "2–4 business days");
  assert.equal(fallbacks["checkout.quote_ready_coupon"], "Server quote ready · Coupon {{ code }} applied. Review the totals before payment.");
  assert.equal(fallbacks["checkout.item_count"], "{{ count }} items");
  assert.equal(fallbacks["checkout.error_stock"], "Some items are unavailable, have insufficient stock, or use different source currencies. Review your cart before checkout.");
  for (const locale of ["ja", "ko"]) {
    for (const value of Object.values(translations[locale])) assert.doesNotMatch(value, /プラッシュ|플러시/);
  }
  assert.equal(translations.ja["checkout.konbini_payment"], "コンビニ払い");
  assert.equal(translations.ko["checkout.konbini_payment"], "편의점 결제");
});

function nodes(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}
const totals = { subtotalAmount: 2000, discountAmount: 200, shippingAmount: 100, taxAmount: 190, totalAmount: 2090, taxRateBps: 1000, currency: "USD", couponCode: "SAVE10" };
function harness(language, { offline = false, customer = { email: "customer@example.test" }, loading = false, empty = false, quoteError } = {}) {
  let stateCursor = 0;
  let refCursor = 0;
  const states = [];
  const refs = [];
  const requests = [];
  const item = { id: "p1", variantId: "v1", name: "Product from API", maker: "Maker", image: "/test.png", imageAlt: "Backend alt", qty: 2, price: 10, currency: "USD" };
  const items = empty ? [] : [item];
  const jsx = (type, props) => ({ type, props });
  class ApiRequestError extends Error {}
  class ApiNotConfiguredError extends Error {}
  const context = { exports: {}, Error, URL, Intl, window: {
    sessionStorage: { getItem: () => null, removeItem() {} }, scrollTo() {}, location: { origin: "https://shop.test" },
  }, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return {
      useEffect() {},
      useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; },
      useState(initial) { const i = stateCursor++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
    };
    if (name === "next/navigation") return { useRouter: () => ({ push() {} }) };
    if (name === "@/lib/cart") return { useCartItems: () => items, readCart: () => items };
    if (name === "@/components/layout/localization-provider") return { useLocalization: () => ({
      t: (key, fallback, values) => translate(language, key, fallback, values), language, currency: "USD", country: "JP",
      deliveryCountries: [{ code: "JP", label: "Japan" }, { code: "US", label: "United States" }],
      convertMajorAmount: (value) => value, formatPrice: (value) => `USD ${value}`,
    }) };
    if (name === "@/lib/localization-options") return { regionName: (code, locale, fallback) => new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? fallback };
    if (name === "@/components/layout/customer-session-provider") return { useCustomerSession: () => ({ customer, isLoading: loading, setCustomer() {} }) };
    if (name === "@/services/ponyo-api.client") return { PONYO_API_BASE_URL: offline ? "" : "/api", ApiRequestError, ApiNotConfiguredError, ponyoApi: {
      async getCheckoutQuote(input) { requests.push(input); if (quoteError) throw quoteError; return totals; },
    } };
    return { default: name };
  } };
  vm.runInNewContext(compile(sourceText), context);
  let tree;
  const render = () => { stateCursor = 0; refCursor = 0; tree = context.exports.CheckoutPageClient({}); return tree; };
  render();
  return { states, requests, render, find: (predicate) => {
    const found = nodes(tree, predicate); assert.equal(found.length, 1); return found[0];
  } };
}

for (const language of locales) {
  const t = (suffix, values) => translate(language, `checkout.${suffix}`, fallbacks[`checkout.${suffix}`], values);
  test(`${language}: delivery/payment/review, raw countries, coupon interpolation and authoritative totals`, async () => {
    const page = harness(language);
    assert.ok(text(page.render()).includes(t("heading")));
    assert.equal(page.find((node) => node.props?.name === "country").props.value, "Japan");
    const countries = nodes(page.render(), (node) => node.type === "option");
    assert.equal(countries[0].props.value, "Japan");
    assert.equal(text(countries[0]), new Intl.DisplayNames([language], { type: "region" }).of("JP"));
    assert.equal(page.find((node) => node.props?.name === "first-name").props.placeholder, t("first_name"));
    page.find((node) => node.props?.onSubmit?.name === "continueToPayment").props.onSubmit({ preventDefault() {} });
    assert.ok(text(page.render()).includes(t("card_privacy")));
    assert.ok(text(page.render()).includes(t("coming_soon")));
    page.find((node) => node.props?.onSubmit?.name === "continueToReview").props.onSubmit({ preventDefault() {} });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.requests[0].shippingAddress.countryCode, "JP");
    assert.equal(page.requests[0].paymentMethod, "card");
    assert.equal(page.requests[0].shippingMethod, "standard");
    assert.equal(page.requests[0].currency, "USD");
    assert.equal(page.requests[0].items[0].expectedPriceAmount, 10);
    const review = text(page.render());
    assert.ok(review.includes(t("quote_ready_coupon", { code: "SAVE10" })));
    assert.ok(review.includes(t("item_count", { count: 2 })));
    assert.ok(review.includes(t("tax_rate", { rate: 10 })));
    assert.ok(review.includes("Product from API"));
    assert.ok(review.includes("$20.90"), "Quote remains in server minor units with no FX conversion");
    page.find((node) => node.props?.id === "checkout-coupon").props.onChange({ target: { value: " NEW " } });
    assert.ok(text(page.render()).includes(t("quote_request")));
    assert.equal(page.find((node) => node.props?.onClick?.name === "placeLocalOrder").props.disabled, true);
  });

  test(`${language}: loading, sign-in, empty and demo states have localized text and accessibility names`, () => {
    assert.equal(text(harness(language, { loading: true }).render()), t("checking_account"));
    const signedOut = harness(language, { customer: null }).render();
    assert.equal(signedOut.props["aria-label"], t("sign_in_label"));
    assert.ok(text(signedOut).includes(t("sign_in_body")));
    assert.ok(text(harness(language, { empty: true }).render()).includes(t("empty_heading")));
    const demo = harness(language, { offline: true });
    assert.ok(text(demo.render()).includes(t("demo_no_payment")));
    demo.states[2] = 2;
    assert.ok(text(demo.render()).includes(t("demo_disclaimer")));
    assert.ok(text(demo.render()).includes(t("place_demo")));
  });

  test(`${language}: frontend quote fallback is localized while unknown backend error messages pass through`, async () => {
    for (const [error, expected] of [["network failure", t("error_quote_failed")], [new Error("Unmapped backend message"), "Unmapped backend message"]]) {
      const page = harness(language, { quoteError: error });
      page.states[2] = 2;
      page.render();
      page.find((node) => node.type === "form" && node.props["aria-busy"] !== undefined).props.onSubmit({ preventDefault() {} });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(page.states[8], expected);
    }
  });
}