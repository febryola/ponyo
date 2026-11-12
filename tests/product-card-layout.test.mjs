import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
function load(path, mocks = {}) {
  const source = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const context = { exports: {}, require: (id) => mocks[id] ?? require(id) };
  vm.runInNewContext(source, context);
  return context.exports;
}

const { selectRelatedProducts } = load("../src/lib/related-products.ts");
const product = { id: "current", categoryName: "Bears", tags: ["premium"] };
const item = (id, categoryName = "Cats", tags = []) => ({ id, categoryName, tags });

test("recommendations prefer related products and fill six distinct slots without the current product", () => {
  const products = [product, item("other-1"), item("bear", "Bears"), item("premium", "Cats", ["premium"]), item("other-2"), item("other-3"), item("other-4"), item("other-5"), item("bear", "Bears")];
  assert.deepEqual(Array.from(selectRelatedProducts(products, product), ({ id }) => id), ["bear", "premium", "other-1", "other-2", "other-3", "other-4"]);
  assert.equal(selectRelatedProducts([product], product).length, 0);
  assert.equal(selectRelatedProducts([product, item("only")], product).length, 1);
  assert.equal(selectRelatedProducts(products.slice(1), product).length, 6);
});

test("the detail page passes six-item selection to its recommendations grid using the full catalog request", () => {
  const page = read("../src/app/products/[id]/page.tsx");
  assert.match(page, /getLocalizedProducts\("\?limit=100"\)/);
  assert.match(page, /const related = selectRelatedProducts\(products, product\)/);
  assert.match(page, /className="related-products store-container"[\s\S]*<ProductGrid products=\{related\}/);
});

const { ProductCard } = load("../src/components/product/product-card.tsx", {
  "next/image": { default: "img" },
  "next/link": { default: "a" },
  "@/lib/wishlist": { saveWishlist() {}, useWishlistHandles: () => [] },
  "@/components/layout/localization-provider": {
    useLocalization: () => ({ formatPrice: (amount) => `IDR\u00a0${amount.toLocaleString("de-DE")}`, t: (_, fallback) => fallback }),
  },
});

test("normal and sale cards give long currency values independent wrapping elements", () => {
  for (const compareAtAmount of [undefined, 123456789]) {
    const tree = ProductCard({ product: { ...product, slug: "bear", name: "Long translated product name", priceAmount: 98765432, compareAtAmount, currency: "IDR", availability: "available", tags: ["premium", "new-arrival"] } });
    const image = tree.props.children[0];
    assert.ok(image.props.children[1].props.children.length >= 3);
    assert.equal(image.props.children[2].props.className, "wishlist-toggle");
    const bottom = tree.props.children[1].props.children[3];
    const prices = bottom.props.children[0];
    assert.equal(prices.props.className, "shop-product-prices");
    assert.equal(prices.props.children[0].props.className, "shop-product-current-price");
    assert.equal(prices.props.children[0].props.children, "IDR\u00a098.765.432");
    assert.equal(prices.props.children[1]?.type ?? null, compareAtAmount ? "del" : null);
  }
});

test("overflow rules reserve wishlist space and six columns are scoped to detail recommendations", () => {
  const css = read("../src/app/theme-parity-polish.css").split("/* Scoped product-card overflow fixes and product-detail recommendations only. */")[1];
  assert.ok(css, "scoped append-only CSS section exists");
  assert.match(css, /\.shop-product-card \.product-labels\s*\{[^}]*right: 56px;[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.product-labels \.product-label\s*\{[^}]*font-size: 9px;[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.shop-product-bottom \.shop-product-prices\s*\{[^}]*flex-wrap: wrap;[^}]*font-size: clamp\(15px, 10cqi, 22px\);/);
  assert.match(css, /@media \(min-width: 1200px\)\s*\{\s*\.product-page \.related-products > \.product-grid\s*\{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
  assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /repeat\(3, minmax\(0, 1fr\)\)/);
});

test("desktop size guide scales square portraits rather than clipping shallow heads", () => {
  const css = read("../src/app/theme-parity-polish.css");
  assert.match(css, /a\.size-guide-tile>span\s*\{[^}]*width: min\(100%, var\(--size-portrait\)\);[^}]*height: auto;[^}]*aspect-ratio: 1;[^}]*border-radius: 50% 50% 12px 12px;/);
  assert.match(css, /a\.size-guide-tile img\s*\{[^}]*object-fit: cover;[^}]*object-position: center;[^}]*transform: none;/);
  const page = read("../src/app/page.tsx");
  assert.ok(page.includes('translationKey={`home.size.${tile.name.toLowerCase()}`}'));
  assert.ok(page.includes('translationKey={`home.size.${tile.rangeKey}`}'));
});