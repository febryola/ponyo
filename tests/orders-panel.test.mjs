import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const dictionary = { exports: {} };
vm.runInNewContext(compile(read("../src/locales/order-translations.ts")), dictionary);
const translations = dictionary.exports.orderTranslations;
const panelSource = read("../src/components/account/local-orders-panel.tsx");
const actionSource = read("../src/components/account/order-actions.tsx");
const locales = ["en", "es", "id", "ja", "ko", "zh-CN"];
class ApiRequestError extends Error { constructor(status) { super(`API ${status}`); this.status = status; } }
class ApiNotConfiguredError extends Error {}
const sample = { id: "preview-1", createdAt: "2026-11-12T10:00:00Z", status: "Confirmed", payment: "demo", total: 25, currency: "USD", trackingNumber: "DEMO-1", items: [{ id: "plush", name: "Soft bunny", maker: "Ponyo", image: "/bunny.jpg", imageAlt: "A bunny", qty: 2, price: 12.5, currency: "USD" }] };
const backend = { id: "private-id", orderNumber: "PNY-42", createdAt: sample.createdAt, status: "pending_payment", paymentStatus: "unpaid", currency: "USD", totalAmount: 3000, subtotalAmount: 2500, discountAmount: 100, shippingAmount: 400, taxAmount: 200, couponCode: "LOVE", customerEmail: "a@example.com", deliveryAddress: "Tokyo", supplierFulfillmentStatus: "awaiting_supplier", trackingNumber: "TRACK-42", items: [{ id: "line-1", name: "Soft bunny", maker: "Ponyo", image: "/bunny.jpg", imageAlt: "A bunny", quantity: 2, unitPrice: 1250, currency: "USD" }] };
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const byClass = (tree, name) => nodes(tree, (node) => node.props?.className?.split(" ").includes(name))[0];
function text(tree) { return tree == null || typeof tree === "boolean" ? "" : typeof tree !== "object" ? String(tree) : Array.isArray(tree) ? tree.map(text).join("") : text(tree.props?.children); }
function harness({ locale = "en", baseUrl = "/api", local = [], search = "", get = async () => [], receipt = async () => ({}), hydrated = true } = {}) {
  let stateCursor = 0, effectCursor = 0, mounted = true;
  const states = [], effects = [], calls = [], writes = [], removed = [], replacements = [];
  const jsx = (type, props) => ({ type, props });
  const window = { location: { search }, sessionStorage: { removeItem: (key) => removed.push(key) }, history: { replaceState: (_state, _title, url) => { replacements.push(url); window.location.search = url.slice(url.indexOf("?")); } } };
  const context = { exports: {}, Error, URLSearchParams, window, require(id) {
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (id === "next/image") return { default: "img" };
    if (id === "next/link") return { default: "a" };
    if (id.endsWith("account-auth-form")) return { AccountAuthForm: "auth" };
    if (id.endsWith("order-actions")) return { OrderActions: "actions" };
    if (id === "react") return {
      useMemo: (callback) => callback(),
      useSyncExternalStore: (_subscribe, snapshot, server) => hydrated ? snapshot() : server(),
      useState(initial) { const i = stateCursor++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { writes.push(mounted); states[i] = typeof value === "function" ? value(states[i]) : value; }]; },
      useEffect(callback, deps) { const i = effectCursor++; const previous = effects[i]; if (!previous || deps.some((value, index) => value !== previous.deps[index])) { previous?.cleanup?.(); effects[i] = { callback, deps, pending: true }; } },
    };
    if (id.endsWith("localization-provider")) return { useLocalization: () => ({ language: locale, formatPrice: (amount, currency) => `${currency} ${amount.toFixed(2)}`, t: (key, fallback, values = {}) => (translations[locale][key] ?? fallback).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(values[key])) }) };
    if (id === "@/lib/local-orders") return { subscribeToLocalOrders: () => {}, getLocalOrdersSnapshot: () => JSON.stringify(local) };
    if (id.endsWith("ponyo-api.client")) return { PONYO_API_BASE_URL: baseUrl, ApiRequestError, ApiNotConfiguredError, ponyoApi: { getOrders: () => { calls.push("orders"); return get(); }, getCheckoutReceipt: (id) => { calls.push(["receipt", id]); return receipt(id); } } };
    throw new Error(`Unexpected import ${id}`);
  } };
  vm.runInNewContext(compile(panelSource), context);
  return { calls, removed, replacements, writes,
    render() { stateCursor = 0; effectCursor = 0; const tree = context.exports.LocalOrdersPanel(); for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup = effect.callback(); } return tree; },
    unmount() { mounted = false; for (const effect of effects) effect.cleanup?.(); },
  };
}

for (const locale of locales) {
  test(`${locale}: complete reviewed dictionary covers every orders call and placeholder`, () => {
    for (const match of `${panelSource}\n${actionSource}`.matchAll(/copy\("([^"]+)",\s*"([^"]+)"/g)) {
      const value = translations[locale][`orders.${match[1]}`];
      assert.ok(value?.trim(), match[1]);
      assert.deepEqual([...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort(), [...match[2].matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort());
    }
  });
  test(`${locale}: API lookup never flashes empty or local private preview data`, async () => {
    const request = deferred(); const page = harness({ locale, local: [sample], get: () => request.promise });
    let tree = page.render();
    assert.equal(tree.props["aria-busy"], true);
    assert.ok(text(tree).includes(translations[locale]["orders.loading"]));
    assert.equal(byClass(tree, "orders-empty"), undefined);
    assert.equal(byClass(tree, "orders-card"), undefined);
    request.resolve([]); await settle(); tree = page.render();
    assert.equal(tree.props["aria-busy"], false);
    assert.ok(text(tree).includes(translations[locale]["orders.empty_body"]));
    assert.equal(nodes(tree, (node) => node.type === "a").at(-1).props.href, "/collections/all");
    assert.doesNotMatch(text(tree), /local checkout preview|preview-1/);
  });
  test(`${locale}: unauthorized embeds compact auth and retries after sign-in`, async () => {
    let attempts = 0; const page = harness({ locale, get: async () => { if (++attempts === 1) throw new ApiRequestError(401); return [backend]; } });
    page.render(); await settle(); let tree = page.render();
    const auth = nodes(tree, (node) => node.type === "auth")[0];
    assert.equal(auth.props.presentation, "drawer");
    assert.equal(byClass(tree, "orders-empty"), undefined);
    assert.ok(text(tree).includes(translations[locale]["orders.guest_title"]));
    auth.props.onAuthenticated(); tree = page.render(); assert.equal(tree.props["aria-busy"], true);
    await settle(); tree = page.render(); assert.ok(byClass(tree, "orders-card"));
    assert.equal(nodes(tree, (node) => node.type === "auth").length, 0);
  });
  test(`${locale}: populated API order retains raw status, totals, metadata and action identity`, async () => {
    const page = harness({ locale, get: async () => [backend] }); page.render(); await settle(); let tree = page.render();
    for (const value of ["PNY-42", "pending payment", "unpaid", "Soft bunny", "USD 25.00", "USD 1.00", "USD 4.00", "USD 2.00", "USD 30.00", "a@example.com", "Tokyo", "awaiting supplier", "TRACK-42", "LOVE"]) assert.ok(text(tree).includes(value), value);
    assert.equal(text(byClass(tree, "orders-status")), "pending payment", "never invent a confirmed status");
    const image = nodes(tree, (node) => node.type === "img")[0]; assert.equal(image.props.width, 192); assert.equal(image.props.alt, "A bunny");
    const actions = nodes(tree, (node) => node.type === "actions")[0]; assert.equal(actions.props.order, backend);
    actions.props.onUpdated({ ...backend, status: "cancelled" }); tree = page.render(); assert.equal(text(byClass(tree, "orders-status")), "cancelled");
    assert.ok(text(tree).includes(new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(backend.createdAt))));
  });
}
test("failed history has an explicit error and retry, never a false empty state", async () => {
  let attempts = 0; const page = harness({ get: async () => { if (++attempts === 1) throw new Error("Backend unavailable"); return []; } });
  page.render(); await settle(); let tree = page.render();
  assert.equal(byClass(tree, "orders-empty"), undefined); assert.match(text(tree), /Backend unavailable/);
  nodes(tree, (node) => node.type === "button")[0].props.onClick(); tree = page.render(); assert.equal(tree.props["aria-busy"], true);
  await settle(); tree = page.render(); assert.ok(byClass(tree, "orders-empty")); assert.equal(page.calls.length, 2);
});
test("receipt flow uses only scoped receipt API, clears idempotency key and remains after URL cleanup", async () => {
  const page = harness({ search: "?session_id=cs_private", receipt: async () => ({ orderNumber: "PNY-42", paymentStatus: "unpaid", status: "pending_payment", currency: "USD", totalAmount: 3000 }) });
  page.render(); await settle(); let tree = page.render();
  assert.deepEqual(page.calls, [["receipt", "cs_private"]]);
  assert.deepEqual(page.removed, ["ponyo:checkout-idempotency-key"]); assert.deepEqual(page.replacements, ["/orders?checkout=success"]);
  assert.ok(byClass(tree, "orders-receipt")); assert.match(text(tree), /unpaid/); assert.doesNotMatch(text(tree), /paid successfully/);
  tree = page.render(); assert.ok(byClass(tree, "orders-receipt")); assert.equal(page.calls.length, 1);
});
test("failed receipt preserves session and key and supports retry without order-history access", async () => {
  let attempts = 0; const page = harness({ search: "?session_id=cs_retry", receipt: async () => { if (++attempts === 1) throw new Error("Receipt pending"); return { orderNumber: "PNY", paymentStatus: "paid", status: "processing", currency: "JPY", totalAmount: 1250 }; } });
  page.render(); await settle(); let tree = page.render(); assert.match(text(tree), /Receipt pending/); assert.equal(page.removed.length, 0);
  nodes(tree, (node) => node.type === "button")[0].props.onClick(); page.render(); await settle(); tree = page.render(); assert.match(text(tree), /JPY 1250.00/); assert.ok(page.calls.every((call) => call[0] === "receipt"));
});
test("explicit demo preview bypasses real APIs and retains browser orders and tracking", () => {
  const page = harness({ search: "?order_id=preview-1", local: [sample] }); const tree = page.render();
  assert.deepEqual(page.calls, []); assert.match(text(tree), /No payment was collected/); assert.match(text(tree), /DEMO-1/); assert.match(text(tree), /Demo tracking reference/);
  assert.equal(nodes(tree, (node) => node.type === "actions").length, 0);
});
test("offline local mode and hydration have distinct, truthful states", () => {
  const server = harness({ hydrated: false }); assert.equal(server.render().props["aria-busy"], true); assert.deepEqual(server.calls, []);
  const local = harness({ baseUrl: "", local: [sample] }); const tree = local.render(); assert.ok(byClass(tree, "orders-card")); assert.match(text(tree), /Preview orders are saved only in this browser/); assert.deepEqual(local.calls, []);
});
test("unmounted requests cannot commit customer data", async () => {
  const request = deferred(); const page = harness({ get: () => request.promise }); page.render(); page.unmount(); request.resolve([backend]); await settle(); assert.deepEqual(page.writes, []);
});
test("scoped stylesheet is imported and primary buttons are brown with cream text", () => {
  const css = read("../src/app/orders-studio.css");
  assert.match(read("../src/app/layout.tsx"), /import "\.\/orders-studio.css"/);
  assert.match(read("../src/components/layout/localization-provider.tsx"), /authTranslations\[language\]\?\.\[key\] \?\? orderTranslations\[language\]/);
  assert.match(css, /--orders-ink: #483126/); assert.match(css, /background: var\(--orders-ink\);\s+color: #fff8e9/);
  assert.match(css, /font-size: 16px/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /grid-template-columns: 72px minmax\(0, 1fr\)/);
  assert.doesNotMatch(panelSource, /shop-button-orange|local checkout preview/);
});