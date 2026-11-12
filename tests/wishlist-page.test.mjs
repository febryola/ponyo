import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const componentText = read("../src/components/layout/wishlist-page-client.tsx");
const source = compile(componentText);
const translationContext = { exports: {} };
vm.runInNewContext(compile(read("../src/locales/wishlist-translations.ts")), translationContext);
const translations = translationContext.exports.wishlistTranslations;
const locales = ["en", "es", "id", "ja", "ko", "zh-CN"];
const keys = "eyebrow title subtitle saved browse collection collection_hint count empty_title empty_body empty_cta empty_note checking synced sync_failed check_failed tip rare".split(" ").map((key) => `wishlist.studio.${key}`);
const products = [
  { id: "bear-id", slug: "bear", name: "Bear" },
  { id: "bunny-id", slug: "bunny", name: "Bunny" },
  { id: "cat-id", slug: "cat", name: "Cat" },
];

class ApiRequestError extends Error {
  constructor(status) { super(`API status ${status}`); this.status = status; }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness({ locale = "en", baseUrl = "/ponyo-api", saved = [], catalog = products, get = async () => ({ productSlugs: [] }), update = async () => {}, keyOnly = false } = {}) {
  let handles = [...saved];
  let cursor = 0, effectCursor = 0, mounted = true;
  const states = [], effects = [], calls = [], saves = [], updates = [], translated = [], stateWrites = [];
  const jsx = (type, props, key) => typeof type === "function" ? type(props) : ({ type, props, key });
  const context = {
    exports: {},
    require(id) {
      switch (id) {
        case "react/jsx-runtime": return { jsx, jsxs: jsx, Fragment: "fragment" };
        case "next/link": return { default: "a" };
        case "react": return {
          useState(initial) {
            const index = cursor++;
            if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
            return [states[index], (value) => {
              stateWrites.push({ mounted, index });
              states[index] = typeof value === "function" ? value(states[index]) : value;
            }];
          },
          useEffect(callback, dependencies) {
            const index = effectCursor++;
            const previous = effects[index];
            if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
              previous?.cleanup?.();
              effects[index] = { callback, dependencies, pending: true };
            }
          },
        };
        case "@/components/product/product-grid": return { ProductGrid: "product-grid" };
        case "@/components/layout/localization-provider": return { useLocalization: () => ({
          t(key, fallback, parameters = {}) {
            translated.push({ key, fallback, parameters });
            const value = keyOnly ? key : translations[locale]?.[key] ?? fallback;
            return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(parameters[name]));
          },
        }) };
        case "@/lib/wishlist": return {
          useWishlistHandles: () => handles,
          readWishlist() { calls.push("read"); return [...handles]; },
          saveWishlist(value) { calls.push("save"); saves.push(Array.from(value)); handles = Array.from(value); },
        };
        case "@/services/ponyo-api.client": return {
          PONYO_API_BASE_URL: baseUrl, ApiRequestError,
          ponyoApi: {
            getWishlist() { calls.push("get"); return get(); },
            updateWishlist(value) { calls.push("update"); updates.push(Array.from(value)); return update(value); },
          },
        };
        default: throw new Error(`Unexpected unmocked import: ${id}`);
      }
    },
  };
  vm.runInNewContext(source, context);
  return {
    calls, saves, updates, translated, stateWrites,
    render() {
      assert.ok(mounted, "cannot render an unmounted harness");
      cursor = 0; effectCursor = 0;
      const tree = context.exports.WishlistPageClient({ products: catalog });
      for (const effect of effects) if (effect.pending) {
        effect.pending = false;
        effect.cleanup = effect.callback();
      }
      return tree;
    },
    // Drain promise continuations, including then/async/catch/finally, without timers or polling.
    async settle() { await new Promise((resolve) => setImmediate(resolve)); },
    setLocale(value) { locale = value; },
    setSaved(value) { handles = [...value]; },
    unmount() { mounted = false; for (const effect of effects) effect.cleanup?.(); },
  };
}

function findAll(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
}
const find = (tree, predicate) => findAll(tree, predicate)[0];
const byClass = (tree, name) => find(tree, (node) => node.props?.className?.split(" ").includes(name));
const collection = (tree) => byClass(tree, "wishlist-studio-collection");
const grid = (tree) => find(tree, (node) => node.type === "product-grid");
const status = (tree) => find(tree, (node) => node.props?.role === "status");
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  return Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
}
const localized = (locale, key, fallback, count = 0) => (translations[locale]?.[`wishlist.studio.${key}`] ?? fallback).replace("{{ count }}", String(count));

for (const locale of locales) {
  test(`${locale}: empty wishlist has localized copy, working discovery links and accessible decoration`, () => {
    const page = harness({ locale, baseUrl: "" });
    const tree = page.render();
    for (const [key, fallback] of [
      ["eyebrow", "THE LITTLE THINGS YOU LOVE"], ["title", "My Wishlist"],
      ["subtitle", "A little collection of plush you can’t stop thinking about. Keep them close, until you’re ready."],
      ["saved", "Saved favorites"], ["browse", "Discover more plush"],
      ["collection", "Your personal collection"], ["collection_hint", "All your heart-picked favorites, together in one place."],
      ["empty_title", "Make room for a little love."],
      ["empty_body", "Found a plush that feels like you? Tap its heart and we’ll keep it here for your next visit."],
      ["empty_cta", "Find your first favorite"], ["empty_note", "A small heart. The start of something lovely."],
      ["rare", "Explore Rare Finds"], ["tip", "Love it now. Come back for it later."],
    ]) assert.ok(text(tree).includes(localized(locale, key, fallback)), key);
    assert.equal(text(byClass(tree, "wishlist-studio-count")), localized(locale, "count", "{{ count }} saved"));
    assert.equal(text(find(tree, (node) => node.type === "strong")), "00");
    assert.deepEqual(findAll(tree, (node) => node.type === "a").map((node) => node.props.href), ["/shop", "/shop", "/collections/rare-finds"]);
    assert.equal(collection(tree).props["aria-busy"], false);
    assert.ok(find(tree, (node) => node.type === "h2" && node.props.id === collection(tree).props["aria-labelledby"]));
    assert.equal(findAll(tree, (node) => node.type === "svg").length, 2);
    for (const decoration of findAll(tree, (node) => node.type === "svg" || node.type === "span" && ["✦", ".", "↗", "♡", "→"].includes(text(node)))) {
      assert.equal(decoration.props["aria-hidden"], "true");
    }
    assert.equal(grid(tree), undefined);
    assert.equal(status(tree), undefined);
    assert.deepEqual(page.calls, []);
  });

  test(`${locale}: populated wishlist filters by slug in catalog order and updates on hook changes`, () => {
    const page = harness({ locale, baseUrl: "", saved: ["cat", "missing", "bear", "cat", "bunny-id"] });
    let tree = page.render();
    assert.deepEqual(grid(tree).props.products, [products[0], products[2]]);
    assert.equal(grid(tree).props.products[0], products[0], "pass original product objects to ProductGrid");
    assert.equal(text(find(tree, (node) => node.type === "strong")), "02");
    assert.equal(text(byClass(tree, "wishlist-studio-count")), localized(locale, "count", "{{ count }} saved", 2));
    assert.equal(byClass(tree, "wishlist-studio-empty"), undefined);
    assert.equal(findAll(tree, (node) => node.type === "a").length, 1);
    page.setSaved(["bunny"]);
    tree = page.render();
    assert.deepEqual(grid(tree).props.products, [products[1]]);
    page.setSaved(["missing"]);
    tree = page.render();
    assert.equal(grid(tree), undefined);
    assert.ok(byClass(tree, "wishlist-studio-empty"));
    assert.deepEqual(page.calls, []);
  });

  for (const outcome of ["synced", "sync_failed", "check_failed", "unauthorized"]) {
    test(`${locale}: account ${outcome} preserves local favorites and exposes the correct status`, async () => {
      const page = harness({ locale, saved: ["bear"],
        get: async () => {
          if (outcome === "unauthorized") throw new ApiRequestError(401);
          if (outcome === "check_failed") throw new Error("Unavailable");
          return { productSlugs: ["cat"] };
        },
        update: async () => { if (outcome === "sync_failed") throw new Error("Write failed"); },
      });
      let tree = page.render();
      assert.equal(collection(tree).props["aria-busy"], true);
      assert.deepEqual(grid(tree).props.products, [products[0]], "local favorites remain visible during account lookup");
      await page.settle();
      tree = page.render();
      assert.equal(collection(tree).props["aria-busy"], false);
      if (["synced", "sync_failed"].includes(outcome)) {
        assert.deepEqual(page.updates, [["cat", "bear"]]);
        assert.deepEqual(page.saves, [["cat", "bear"]], "failed remote sync must still preserve the merged local list");
        assert.deepEqual(grid(tree).props.products, [products[0], products[2]]);
      } else {
        assert.deepEqual(page.updates, []);
        assert.deepEqual(page.saves, [], "failed account lookup must not overwrite local favorites");
        assert.deepEqual(grid(tree).props.products, [products[0]]);
      }
      if (outcome === "unauthorized") assert.equal(status(tree), undefined);
      else {
        const fallback = { synced: "Your favorites are saved to your Ponyo account.", sync_failed: "Some favorites couldn’t be synced. Try saving them again.", check_failed: "We couldn’t check your account favorites right now." }[outcome];
        assert.ok(text(status(tree)).endsWith(localized(locale, outcome, fallback)));
        assert.equal(status(tree).props.className.includes("is-warning"), outcome !== "synced");
        assert.equal(find(status(tree), (node) => node.type === "span").props["aria-hidden"], "true");
      }
      page.setLocale(locale === "ja" ? "es" : "ja");
      const callsBefore = [...page.calls];
      tree = page.render();
      assert.deepEqual(page.calls, callsBefore, "rerenders and locale changes must not repeat account sync");
      assert.equal(text(find(tree, (node) => node.type === "h1")), `${translations[locale === "ja" ? "es" : "ja"]["wishlist.studio.title"]}.`);
    });
  }

  test(`${locale}: pending empty account lookup uses localized checking copy until settled`, async () => {
    const pending = deferred();
    const page = harness({ locale, get: () => pending.promise });
    let tree = page.render();
    assert.equal(text(find(tree, (node) => node.type === "h3")), localized(locale, "checking", "Gathering your favorites…"));
    assert.equal(collection(tree).props["aria-busy"], true);
    pending.resolve({ productSlugs: [] });
    await page.settle();
    tree = page.render();
    assert.equal(text(find(tree, (node) => node.type === "h3")), localized(locale, "empty_title", "Make room for a little love."));
    assert.equal(collection(tree).props["aria-busy"], false);
    assert.deepEqual(page.updates, []);
    assert.deepEqual(page.saves, [[]]);
  });
}

test("account merge deduplicates slugs, reads latest local favorites and saves only after remote update settles", async () => {
  const lookup = deferred(), write = deferred();
  const page = harness({ saved: ["bear"], get: () => lookup.promise, update: () => write.promise });
  page.render();
  page.setSaved(["bear", "bunny", "bear", "missing"]);
  lookup.resolve({ productSlugs: ["cat", "bear"] });
  await page.settle();
  assert.deepEqual(page.updates, [["cat", "bear", "bunny", "missing"]]);
  assert.deepEqual(page.saves, []);
  assert.equal(collection(page.render()).props["aria-busy"], true);
  write.resolve();
  await page.settle();
  assert.deepEqual(page.calls, ["get", "read", "update", "save"]);
  assert.deepEqual(page.saves, [["cat", "bear", "bunny", "missing"]]);
  assert.deepEqual(grid(page.render()).props.products, products);
  assert.equal(collection(page.render()).props["aria-busy"], false);
});

test("account-only favorites and already-contained local favorites save without redundant remote update", async () => {
  for (const saved of [[], ["bear"], ["cat", "bear"]]) {
    const page = harness({ saved, get: async () => ({ productSlugs: ["cat", "bear"] }) });
    page.render();
    await page.settle();
    const tree = page.render();
    assert.deepEqual(page.calls, ["get", "read", "save"]);
    assert.deepEqual(page.updates, []);
    assert.deepEqual(page.saves, [["cat", "bear"]]);
    assert.deepEqual(grid(tree).props.products, [products[0], products[2]]);
    assert.ok(status(tree));
  }
});

test("non-authentication and non-Error lookup failures warn without destroying local favorites", async () => {
  for (const error of [new ApiRequestError(503), new Error("Offline"), null, { status: 401 }]) {
    const page = harness({ saved: ["bunny"], get: async () => { throw error; } });
    page.render();
    await page.settle();
    const tree = page.render();
    assert.ok(text(status(tree)).includes("We couldn’t check your account favorites right now."));
    assert.deepEqual(grid(tree).props.products, [products[1]]);
    assert.deepEqual(page.calls, ["get"]);
    assert.equal(collection(tree).props["aria-busy"], false);
  }
});

for (const stage of ["lookup-success", "lookup-error", "update-success", "update-error"]) {
  test(`unmount during ${stage} prevents late saves and state writes`, async () => {
    const pending = deferred();
    const duringUpdate = stage.startsWith("update");
    const page = harness({ saved: ["bear"],
      get: () => duringUpdate ? Promise.resolve({ productSlugs: ["cat"] }) : pending.promise,
      update: () => pending.promise,
    });
    page.render();
    if (duringUpdate) await page.settle();
    const callsBefore = [...page.calls];
    const writesBefore = page.stateWrites.length;
    page.unmount();
    if (stage.endsWith("error")) pending.reject(new Error("Offline"));
    else pending.resolve({ productSlugs: ["cat"] });
    await page.settle();
    assert.deepEqual(page.calls, callsBefore);
    assert.deepEqual(page.saves, []);
    assert.equal(page.stateWrites.length, writesBefore);
  });
}

test("without a backend, repeated renders never read, merge, save or call the API", async () => {
  const page = harness({ baseUrl: "", saved: ["bear"] });
  page.render();
  await page.settle();
  page.setLocale("ja");
  page.setSaved(["cat"]);
  const tree = page.render();
  assert.deepEqual(grid(tree).props.products, [products[2]]);
  assert.equal(collection(tree).props["aria-busy"], false);
  assert.equal(status(tree), undefined);
  assert.deepEqual(page.calls, []);
  assert.deepEqual(page.stateWrites, []);
});

test("all 18 localized keys reach the actual component, including dynamic account statuses", async () => {
  const used = new Set();
  for (const outcome of ["synced", "sync_failed", "check_failed"]) {
    const page = harness({ keyOnly: true, saved: [],
      get: async () => {
        if (outcome === "check_failed") throw new Error("Offline");
        return { productSlugs: ["missing"] };
      },
      update: async () => { if (outcome === "sync_failed") throw new Error("Offline"); },
    });
    // Include a local-only slug to trigger the update branch while keeping the empty UI.
    page.setSaved(["other-missing"]);
    page.render();
    await page.settle();
    const tree = page.render();
    for (const { key } of page.translated) used.add(key);
    assert.ok(text(status(tree)).includes(`wishlist.studio.${outcome}`));
    assert.equal(text(byClass(tree, "wishlist-studio-count")), "wishlist.studio.count");
    const countCall = page.translated.find(({ key }) => key === "wishlist.studio.count");
    assert.equal(countCall.parameters.count, 0);
  }
  assert.deepEqual([...used].sort(), [...keys].sort());
});

test("all five reviewed languages have exactly 18 nonblank keys with a single count placeholder", () => {
  assert.deepEqual(Object.keys(translations), locales.slice(1));
  for (const [locale, dictionary] of Object.entries(translations)) {
    assert.equal(Object.keys(dictionary).length, 18, locale);
    assert.deepEqual(Object.keys(dictionary).sort(), [...keys].sort(), locale);
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, "string", `${locale}: ${key}`);
      assert.ok(value.trim(), `${locale}: ${key}`);
      assert.deepEqual(value.match(/\{\{[^}]+\}\}/g) ?? [], key.endsWith(".count") ? ["{{ count }}"] : [], `${locale}: ${key}`);
    }
  }
});

const css = read("../src/app/wishlist-studio.css");
function mediaBlock(query) {
  const start = css.indexOf(`@media (${query})`);
  assert.notEqual(start, -1, query);
  const open = css.indexOf("{", start);
  let depth = 1, end = open + 1;
  while (depth && end < css.length) {
    if (css[end] === "{") depth++;
    if (css[end] === "}") depth--;
    end++;
  }
  assert.equal(depth, 0, `balanced media block: ${query}`);
  return css.slice(open + 1, end - 1);
}

test("wishlist styles stay scoped, including shared product cards and keyboard focus", () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.ok(rules.length > 50, "inspect actual style rules, not an empty stylesheet");
  for (const [, selectors] of rules) for (const selector of selectors.split(",")) {
    assert.match(selector.trim(), /^\.wishlist-studio(?:[-\s.:]|$)/, selector);
    if (/\.(?:product-grid|shop-product-|wishlist-toggle)/.test(selector)) {
      assert.match(selector.trim(), /^\.wishlist-studio\s+/, selector);
    }
  }
  assert.match(css, /\.wishlist-studio a:focus-visible\s*\{[^}]*outline: 2px solid[^}]*outline-offset: 5px;/);
  assert.match(css, /\.wishlist-studio \.product-grid\s*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test("responsive wishlist layout uses three then two grid columns and a single-column mobile hero", () => {
  const tablet = mediaBlock("max-width: 1000px");
  const mobile = mediaBlock("max-width: 640px");
  assert.match(tablet, /\.wishlist-studio \.product-grid\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(mobile, /\.wishlist-studio \.product-grid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)[^}]*gap: 12px;/);
  assert.match(mobile, /\.wishlist-studio-hero\s*\{[^}]*grid-template-columns: 1fr;/);
  assert.match(mobile, /\.wishlist-studio-keepsake\s*\{[^}]*position: absolute;/);
  assert.match(mobile, /\.wishlist-studio-keepsake > \.wishlist-studio-art\s*\{[^}]*display: none;/);
  assert.match(mobile, /\.wishlist-studio-empty-art\s*\{[^}]*width: 170px;/);
  assert.match(mobile, /\.wishlist-studio \.wishlist-content\s*\{[^}]*padding-top: 16px;[^}]*padding-bottom: 44px;/);
});

test("wishlist keeps the hero compact and product cards sharp", () => {
  assert.match(css, /\.wishlist-studio-hero\s*\{[^}]*padding: 25px 48px;/);
  assert.match(css, /\.wishlist-studio-keepsake\s*\{[^}]*max-width: 240px;/);
  assert.match(css, /\.wishlist-studio \.shop-product-card\s*\{[^}]*border-radius: 0;/);
  assert.match(css, /\.wishlist-studio \.shop-product-image\s*\{[^}]*border-radius: 0;/);
});

test("reduced motion disables transitions and hover transforms for both cards and primary CTA", () => {
  const reduced = mediaBlock("prefers-reduced-motion: reduce");
  assert.match(reduced, /\.wishlist-studio \.shop-product-card,\s*\.wishlist-studio-primary\s*\{\s*transition: none;/);
  assert.match(reduced, /\.wishlist-studio \.shop-product-card:hover,\s*\.wishlist-studio-primary:hover\s*\{\s*transform: none;/);
});