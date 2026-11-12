import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
function loadTranslations(path, name) {
  const context = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports[name];
}
const translations = loadTranslations("src/locales/storefront-translations.ts", "storefrontTranslations");
const appTranslations = loadTranslations("src/locales/app-translations.ts", "appTranslations");
const authTranslations = loadTranslations("src/locales/auth-translations.ts", "authTranslations");
const locales = ["es", "id", "ja", "ko", "zh-CN"];
const sharedKeys = Object.keys(translations.es).sort();
const placeholders = (text) => [...text.matchAll(/\{\{\s*\w+\s*\}\}/g)].map(([token]) => token).sort();
const expectedPlaceholders = {
  "cart.decrease_item": ["{{ title }}"],
  "cart.increase_item": ["{{ title }}"],
  "search.for_query": ["{{ query }}"],
  "search.view_all_for": ["{{ query }}"],
  "search.result_count_one": ["{{ count }}"],
  "search.result_count_other": ["{{ count }}"],
  "journal.read_minutes": ["{{ minutes }}"],
  "account.auth.verification_sent": ["{{ email }}"],
};

test("all five locales have the same 113 reviewed keys, with only the documented Japanese override", () => {
  assert.deepEqual(Object.keys(translations).sort(), [...locales].sort());
  assert.equal(sharedKeys.length, 113);
  for (const locale of locales) {
    const keys = Object.keys(translations[locale]).filter((key) => key !== "home.footer.rights").sort();
    assert.deepEqual(keys, sharedKeys, locale);
    for (const [key, value] of Object.entries(translations[locale])) {
      assert.equal(typeof value, "string", `${locale}:${key}`);
      assert.ok(value.trim().length > 0, `${locale}:${key}`);
      assert.equal(value, value.trim(), `${locale}:${key} has edge whitespace`);
      assert.ok(!value.includes("\uFFFD"), `${locale}:${key} has encoding damage`);
    }
  }
  assert.equal(Object.keys(translations.ja).length, 114);
  assert.equal(translations.ja["home.footer.rights"], "すべての権利を留保します。");
  assert.notEqual(translations.ja["home.footer.rights"], appTranslations.ja["home.footer.rights"]);
});

test("placeholders retain their exact spelling, spacing and multiplicity in every locale", () => {
  for (const locale of locales) {
    for (const [key, value] of Object.entries(translations[locale])) {
      assert.deepEqual(placeholders(value), expectedPlaceholders[key] ?? [], `${locale}:${key}`);
      assert.ok(!value.replace(/\{\{\s*\w+\s*\}\}/g, "").match(/[{}]/), `${locale}:${key}`);
      const substituted = value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => ({
        title: "Ponyo", query: "bunny", count: "2", minutes: "3", email: "test@example.com",
      })[name]);
      assert.ok(!substituted.includes("undefined"), `${locale}:${key}`);
      assert.ok(!substituted.includes("{{"), `${locale}:${key}`);
    }
  }
});

function sourceFiles(directory) {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}
const uiSources = [...sourceFiles("src/app"), ...sourceFiles("src/components")].map(read);
const uiText = uiSources.join("\n");

test("active supplemental UI keys have source evidence, including dynamic product promo keys", () => {
  for (const key of sharedKeys) {
    // Journal and the eight size labels are wired separately by the page owner.
    if (key.startsWith("journal.") || key.startsWith("home.pages.") || key.startsWith("home.size.")) continue;
    // The auth redesign uses a simple divider rather than an artificial "or" choice.
    if (key === "account.auth.or") continue;
    assert.ok(uiText.includes(`"${key}"`), `${key} has no UI source reference`);
  }
  const promoSource = read("src/components/product/product-grid.tsx");
  for (const key of sharedKeys.filter((key) => key.startsWith("fill."))) {
    assert.ok(promoSource.includes(`"${key}"`), key);
  }
  assert.ok(promoSource.includes("t(promo.titleKey, promo.title)"));
  assert.ok(promoSource.includes("t(promo.bodyKey, promo.body)"));
  assert.ok(promoSource.includes("t(promo.actionKey, promo.action)"));
});

test("shared keys fill gaps in both app-owned and reference locale dictionaries", () => {
  for (const locale of locales) {
    const dictionary = JSON.parse(read(`src/locales/${locale}.json`).replace(/^\/\*[\s\S]*?\*\/\s*/, ""));
    for (const key of sharedKeys) {
      assert.equal(appTranslations[locale]?.[key], undefined, `${locale}:${key} already in app dictionary`);
      const existing = key.split(".").reduce((value, part) => value?.[part], dictionary);
      assert.notEqual(typeof existing, "string", `${locale}:${key} already in locale JSON`);
    }
  }
});

test("eight prepared size keys preserve measurements and natural Japanese/Korean labels", () => {
  const suffixes = ["small", "medium", "large", "xl", "under_25", "range_medium", "range_large", "range_xl"];
  assert.deepEqual(sharedKeys.filter((key) => key.startsWith("home.size.")), suffixes.map((key) => `home.size.${key}`).sort());
  for (const locale of locales) {
    for (const [key, numbers] of Object.entries({ under_25: ["25"], range_medium: ["25", "45"], range_large: ["45", "70"], range_xl: ["70"] })) {
      assert.deepEqual(translations[locale][`home.size.${key}`].match(/\d+/g), numbers, `${locale}:${key}`);
    }
  }
  assert.deepEqual(suffixes.slice(0, 4).map((key) => translations.ja[`home.size.${key}`]), ["小さめ", "ふつう", "大きめ", "特大"]);
  assert.deepEqual(suffixes.slice(0, 4).map((key) => translations.ko[`home.size.${key}`]), ["소형", "중형", "대형", "특대형"]);
});

test("prepared journal/account keys map to existing English UI rather than invented features", () => {
  const english = JSON.parse(read("src/locales/en.default.json").replace(/^\/\*[\s\S]*?\*\/\s*/, ""));
  for (const key of sharedKeys.filter((key) => key.startsWith("home.pages."))) {
    assert.equal(typeof key.split(".").reduce((value, part) => value?.[part], english), "string", key);
  }
  const auth = read("src/components/account/account-auth-form.tsx");
  for (const phrase of ["YOUR PONYO ACCOUNT", "Welcome back", "Create your account", "Reset your password", "Full name", "Email address", "Password", "Show password", "Hide password", "Forgot password?", "Send reset instructions", "Back to sign in"]) {
    assert.ok(auth.includes(phrase), phrase);
  }
  const article = read("src/app/blogs/[handle]/[article]/page.tsx");
  assert.ok(article.includes('ui("keepReading")'));
  assert.ok(article.includes('ui("readTime"'));
  const journalUI = read("src/locales/journal-ui.ts");
  assert.ok(journalUI.includes('keepReading: "Keep reading"'));
  assert.ok(journalUI.includes('readTime: "{minutes} min read"'));
});

test("Japanese and Korean use native plush terminology, with no duplicate dictionary properties", () => {
  assert.ok(translations.ja["search.popular"].includes("ぬいぐるみ"));
  assert.ok(translations.ko["search.popular"].includes("인형"));
  for (const locale of ["ja", "ko"]) {
    for (const value of Object.values(translations[locale])) assert.doesNotMatch(value, /プラッシュ|플러시/);
  }
  const source = ts.createSourceFile("storefront-translations.ts", read("src/locales/storefront-translations.ts"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.filter(ts.isPropertyAssignment).map((property) => property.name.getText(source));
      assert.equal(new Set(names).size, names.length, "Duplicate translation property");
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
});

test("every supplemental auth key is wired with a nonempty English fallback", () => {
  const source = ts.createSourceFile("account-auth-form.tsx", read("src/components/account/account-auth-form.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wired = new Set();
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith("account.auth.")) {
      const [key, fallback] = node.arguments;
      wired.add(key.text);
      assert.ok(ts.isStringLiteral(fallback) && fallback.text.trim(), key.text);
      assert.deepEqual(placeholders(fallback.text), expectedPlaceholders[key.text] ?? [], key.text);
      for (const locale of locales) assert.equal(typeof (authTranslations[locale][key.text] ?? translations[locale][key.text]), "string", `${locale}:${key.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const key of sharedKeys.filter((key) => key.startsWith("account.auth.") && key !== "account.auth.or")) assert.ok(wired.has(key), key);
});

const require = createRequire(import.meta.url);
const optionsContext = { exports: {}, Intl };
vm.runInNewContext(ts.transpileModule(read("src/lib/localization-options.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, optionsContext);
const options = optionsContext.exports;
const pickerSource = ts.transpileModule(read("src/components/layout/localization-picker.tsx"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function pickerHarness(initialLocale) {
  let language = initialLocale;
  let currency = "JPY";
  let cursor = 0;
  const hooks = [];
  const context = { exports: {}, require(id) {
    if (id === "react") return {
      useState(initial) {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], (value) => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
      },
      useRef: () => ({ current: null }),
      useEffect() {},
      useMemo(compute, dependencies) {
        const index = cursor++;
        const previous = hooks[index];
        if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) hooks[index] = { dependencies, value: compute() };
        return hooks[index].value;
      },
    };
    if (id === "@/lib/localization-options") return options;
    if (id === "@/components/layout/localization-provider") return { useLocalization: () => ({
      language, currency, languages: options.languages, currencies: options.currencies, rates: { JPY: 1 },
      setLanguage: async (value) => { language = value; }, setCurrency: async (value) => { currency = value; },
      t: (key, fallback, values = {}) => {
        const template = key === "localization.change_language" ? "{{ language }} / {{ currency }}" : fallback;
        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => values[name] ?? match);
      },
    }) };
    return require(id);
  } };
  vm.runInNewContext(pickerSource, context);
  return {
    setLocale(value) { language = value; },
    render() { cursor = 0; return context.exports.LocalizationPicker({}); },
  };
}

function elements(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, predicate));
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
}
const one = (tree, predicate) => {
  const matches = elements(tree, predicate);
  assert.equal(matches.length, 1);
  return matches[0];
};
const optionCodes = (tree) => elements(tree, (node) => node.props?.role === "option").map((node) => node.key);

for (const locale of ["en", ...locales]) {
  test(`${locale}: picker searches displayed countries/currencies and announces localized currency`, async () => {
    const harness = pickerHarness(locale);
    const trigger = one(harness.render(), (node) => node.props?.["aria-haspopup"] === "dialog");
    assert.equal(trigger.props["aria-label"], `${options.languages.find((item) => item.code === locale).label} / ${options.currencyName("JPY", locale, "Japanese Yen")}`);
    trigger.props.onClick();
    const search = (query) => {
      one(harness.render(), (node) => node.type === "input").props.onChange({ target: { value: query } });
      return harness.render();
    };
    assert.ok(optionCodes(search(options.regionName("JP", locale, "Japan"))).includes("ja"));
    assert.ok(optionCodes(search(options.regionName("KR", locale, "South Korea"))).includes("ko"));
    assert.deepEqual(optionCodes(search("  jA  ")), ["ja"]);
    assert.deepEqual(optionCodes(search("日本語")), ["ja"]);
    assert.deepEqual(optionCodes(search("한국어")), ["ko"]);
    elements(harness.render(), (node) => node.props?.role === "tab")[1].props.onClick();
    for (const item of options.currencies) {
      assert.ok(optionCodes(search(options.currencyName(item.code, locale, item.label))).includes(item.code), item.code);
    }
    assert.ok(optionCodes(search(options.regionName("JP", locale, "Japan"))).includes("JPY"));
    assert.deepEqual(optionCodes(search("  uSd  ")), ["USD"]);
    assert.deepEqual(optionCodes(search("US Dollar")), ["USD"]);
    assert.deepEqual(optionCodes(search("no-such-currency")), []);
    const usd = one(search("USD"), (node) => node.props?.role === "option");
    await usd.props.onClick();
    assert.equal(one(harness.render(), (node) => node.props?.["aria-haspopup"] === "dialog").props["aria-label"], `${options.languages.find((item) => item.code === locale).label} / ${options.currencyName("USD", locale, "US Dollar")}`);
  });
}

test("picker recomputes localized search results when language changes without query changes", () => {
  const harness = pickerHarness("en");
  one(harness.render(), (node) => node.props?.["aria-haspopup"] === "dialog").props.onClick();
  one(harness.render(), (node) => node.type === "input").props.onChange({ target: { value: "イギリス" } });
  assert.deepEqual(optionCodes(harness.render()), []);
  harness.setLocale("ja");
  assert.deepEqual(optionCodes(harness.render()), ["en"]);
  elements(harness.render(), (node) => node.props?.role === "tab")[1].props.onClick();
  one(harness.render(), (node) => node.type === "input").props.onChange({ target: { value: "米ドル" } });
  assert.deepEqual(optionCodes(harness.render()), ["USD"]);
  harness.setLocale("ko");
  assert.deepEqual(optionCodes(harness.render()), []);
});