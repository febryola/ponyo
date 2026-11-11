import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function cart() {
  const storage = new Map();
  const context = { exports: {}, require: () => ({}), localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }, window: { dispatchEvent() {} }, CustomEvent: class {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/cart.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const line = (variantId = "v1", extra = {}) => ({ id: "product", catalogId: "product", variantId, slug: "toy", name: "Toy", maker: "Ponyo", price: 1200, currency: "JPY", image: "/toy.png", imageAlt: "Toy", qty: 1, ...extra });

test("two variants of one product remain separate removable lines", () => {
  const api = cart();
  const items = api.addCartItem(api.addCartItem([], line()), line("v2"));
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "v1");
  assert.equal(items[1].id, "v2");
  api.saveCart(items.filter((item) => item.id !== "v1"));
  assert.equal(api.readCart()[0].variantId, "v2");
});

test("repeated variants update current prices and cap quantity without changing legacy identity", () => {
  const api = cart();
  const items = api.addCartItem([line("v1", { id: "old-product", qty: 98 })], line("v1", { qty: 4, price: 1500 }));
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "old-product");
  assert.equal(items[0].qty, 99);
  assert.equal(items[0].price, 1500);
});

test("invalid quantities and prices cannot be added", () => {
  const api = cart();
  for (const qty of [0, -1, 1.5, NaN, "2", true]) assert.equal(api.addCartItem([], line("v1", { qty })).length, 0);
  for (const price of [-1, NaN, Infinity]) assert.equal(api.addCartItem([], line("v1", { price })).length, 0);
});

test("line cap preserves existing cart and still permits quantity updates", () => {
  const api = cart();
  const items = Array.from({ length: 100 }, (_, index) => line(`v${index}`, { id: `v${index}` }));
  assert.equal(api.addCartItem(items, line("overflow")), items);
  assert.equal(api.addCartItem(items, line("v0"))[0].qty, 2);
});

test("saved quantities survive reads and empty replacement clears storage", () => {
  const api = cart();
  api.saveCart([line("v1", { qty: 7 })]);
  assert.equal(api.readCart()[0].qty, 7);
  api.saveCart([]);
  assert.equal(api.readCart().length, 0);
});