import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

const cartSource = compile("../src/lib/cart.ts");
const syncSource = compile("../src/components/layout/cart-sync.tsx");
const ownerKey = "ponyo-cart-owner";
const copy = (value) => JSON.parse(JSON.stringify(value));
// Drain promise continuations (including Promise.all), without real timer delays.
const settle = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function line(variantId = "v1", qty = 1, extra = {}) {
  return {
    id: `product-${variantId}`, catalogId: `product-${variantId}`, variantId,
    slug: variantId, name: variantId, maker: "Ponyo", price: 1250,
    currency: "JPY", image: "/product.png", imageAlt: "Product", qty, ...extra,
  };
}

function remote(items = [], currency = "JPY") {
  return { currency, items: items.map(([variantId, quantity, productId = `product-${variantId}`]) => ({ variantId, quantity, productId })) };
}

function product(extra = {}) {
  return {
    id: "p1", slug: "product-one", name: "Product one", supplierName: "Maker",
    variantId: "v1", priceAmount: 9999, currency: "JPY",
    image: { src: "/one.png" }, imageAlt: "Product one image",
    variants: [{ id: "v1", priceAmount: 9999, currency: "JPY" }], ...extra,
  };
}

function unavailable(variantId, qty, productId = "p1", currency = "JPY") {
  return line(variantId, qty, {
    id: variantId, catalogId: productId, slug: productId,
    name: "Unavailable product", maker: "Ponyo", price: 0, currency,
    image: "/images/catalog/ponyo-2.png", imageAlt: "Unavailable product",
    availability: "unavailable", availableQuantity: 0, validationIssue: "product_unavailable",
  });
}

function harness(t, { items = [], owner, getCart = async () => remote(), getProduct = async () => product(), updateCart = async () => ({}) } = {}) {
  const storage = new Map();
  const listeners = new Map();
  const timers = new Map();
  const calls = { getCart: [], getProduct: [], updateCart: [] };
  const warnings = [];
  let now = 0;
  let nextTimer = 0;
  let session = { customer: null, isLoading: false };
  let effect;
  let dependencies;
  let cleanup;
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const window = {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener: (type, listener) => listeners.get(type)?.delete(listener),
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event);
      return true;
    },
  };
  const react = {
    useEffect(callback, deps) {
      if (!dependencies || deps.some((value, index) => !Object.is(value, dependencies[index]))) {
        effect = callback;
        dependencies = [...deps];
      }
    },
  };
  const api = Object.fromEntries(Object.entries({ getCart, getProduct, updateCart }).map(([name, implementation]) => [name, (...args) => {
    calls[name].push(copy(args));
    return implementation(...args);
  }]));
  const context = vm.createContext({
    exports: {}, localStorage, window,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    console: { warn: (...args) => warnings.push(args) },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    require(name) {
      if (name === "react") return react;
      throw new Error(`Unexpected cart import: ${name}`);
    },
  });
  // Use the real cart storage/event implementation, not a second implementation.
  // CommonJS modules need separate lexical scopes even in the same browser VM.
  vm.runInContext(`(function (exports, require) {\n${cartSource}\n})(exports, require);`, context, { filename: "cart.js" });
  const cart = context.exports;
  context.exports = {};
  context.require = (name) => {
    if (name === "react") return react;
    if (name === "@/components/layout/customer-session-provider") return { useCustomerSession: () => session };
    if (name === "@/lib/cart") return cart;
    if (name === "@/services/ponyo-api.client") return { ponyoApi: api, PONYO_API_BASE_URL: "/ponyo-api" };
    throw new Error(`Unexpected CartSync import: ${name}`);
  };
  vm.runInContext(`(function (exports, require) {\n${syncSource}\n})(exports, require);`, context, { filename: "cart-sync.js" });
  cart.saveCart(items);
  if (owner) localStorage.setItem(ownerKey, owner);

  function unmount() {
    cleanup?.();
    cleanup = undefined;
    dependencies = undefined;
  }
  t.after(unmount);
  return {
    calls, warnings, localStorage, cart,
    items: () => copy(cart.readCart()),
    listenerCount: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
    timerCount: () => timers.size,
    render(customerId = "A", isLoading = false) {
      session = { customer: customerId ? { id: customerId } : null, isLoading };
      effect = undefined;
      assert.equal(context.exports.CartSync(), null);
      if (effect) {
        cleanup?.();
        cleanup = effect();
      }
    },
    edit: (next) => cart.saveCart(next),
    storageEvent: (key = cart.cartStorageKey) => window.dispatchEvent({ type: "storage", key }),
    unmount,
    async advance(milliseconds) {
      const target = now + milliseconds;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
        await settle();
      }
      now = target;
      await settle();
    },
  };
}

test("login merges by maximum quantity, never sums or sends duplicate variants", async (t) => {
  const h = harness(t, {
    items: [line("v1", 2), line("v1", 3), line("v2", 7)],
    getCart: async () => remote([["v1", 5], ["v2", 4]]),
  });
  h.render();
  await settle();
  await h.advance(300);
  assert.deepEqual(h.calls.updateCart, [[{ currency: "JPY", items: [{ variantId: "v1", quantity: 5 }, { variantId: "v2", quantity: 7 }] }]]);
  assert.equal(h.calls.getProduct.length, 0);
  h.storageEvent();
  await h.advance(1000);
  assert.equal(h.calls.updateCart.length, 1, "accepted payload must not be sent twice");
});

test("remote-only variants hydrate from one product request with unchanged minor-unit prices", async (t) => {
  const h = harness(t, {
    getCart: async () => remote([["v1", 2, "p1"], ["v2", 3, "p1"]], "USD"),
    getProduct: async () => product({ variants: [
      { id: "v1", priceAmount: 1299, currency: "USD" },
      { id: "v2", priceAmount: 2599, currency: "USD" },
    ] }),
  });
  h.render();
  await settle();
  assert.deepEqual(h.calls.getProduct, [["p1"]]);
  assert.deepEqual(h.items(), [
    line("v1", 2, { id: "v1", catalogId: "p1", slug: "product-one", name: "Product one", maker: "Maker", price: 1299, currency: "USD", image: "/one.png", imageAlt: "Product one image" }),
    line("v2", 3, { id: "v2", catalogId: "p1", slug: "product-one", name: "Product one", maker: "Maker", price: 2599, currency: "USD", image: "/one.png", imageAlt: "Product one image" }),
  ]);
  assert.equal(new Set(h.items().map(({ id }) => id)).size, 2, "variants of one product have distinct line identities");
  await h.advance(1000);
  assert.equal(h.calls.updateCart.length, 0, "hydration alone must not replace an unchanged server cart");
});

test("failed initial GET blocks PUT even after later browser edits", async (t) => {
  const h = harness(t, { items: [line()], getCart: async () => { throw new Error("offline"); } });
  h.render();
  await settle();
  h.edit([line("v1", 8)]);
  h.storageEvent();
  await h.advance(5000);
  assert.equal(h.calls.getCart.length, 1);
  assert.equal(h.calls.updateCart.length, 0);
  assert.equal(h.items()[0].qty, 8);
  assert.equal(h.warnings.length, 1);
});

test("failed product hydration never PUTs a partial browser snapshot", async (t) => {
  const h = harness(t, {
    items: [line("local")], getCart: async () => remote([["v1", 2, "p1"]]),
    getProduct: async () => { throw new Error("product unavailable"); },
  });
  h.render();
  await settle();
  h.edit([line("local", 4)]);
  await h.advance(5000);
  assert.deepEqual(h.calls.getProduct, [["p1"]]);
  assert.deepEqual(h.items(), [line("local", 4)]);
  assert.equal(h.calls.updateCart.length, 0);
  assert.equal(h.warnings.length, 1);
});

test("missing/inactive remote variant is retained instead of using another variant's price", async (t) => {
  const h = harness(t, {
    getCart: async () => remote([["missing", 2, "p1"]]),
    getProduct: async () => product({ variantId: "missing" }),
  });
  h.render();
  await settle();
  h.storageEvent(null);
  await h.advance(1000);
  assert.deepEqual(h.items(), [unavailable("missing", 2)]);
  assert.equal(h.calls.updateCart.length, 0);
  assert.equal(h.warnings.length, 0);
});

test("product 404 retains a placeholder and removing it can PUT the remaining cart", async (t) => {
  const h = harness(t, {
    getCart: async () => remote([["gone", 2, "hidden"], ["v1", 3, "p1"]], "USD"),
    getProduct: async (id) => {
      if (id === "hidden") throw { status: 404 };
      return product({ variants: [{ id: "v1", priceAmount: 1299, currency: "USD" }] });
    },
  });
  h.render();
  await settle();
  assert.deepEqual(h.items()[0], unavailable("gone", 2, "hidden", "USD"));
  assert.equal(h.items()[1].id, "v1");
  await h.advance(1000);
  assert.equal(h.calls.updateCart.length, 0, "mixed unchanged cart is already accepted remotely");
  h.edit(h.items().filter(({ id }) => id !== "gone"));
  await h.advance(300);
  assert.deepEqual(h.calls.updateCart, [[{ currency: "USD", items: [{ variantId: "v1", quantity: 3 }] }]]);
  assert.equal(h.warnings.length, 0);
});

test("unknown, network and non-404 product failures remain fail-closed", async (t) => {
  for (const error of [null, "404", { status: "404" }, { status: 503 }, new TypeError("Failed to fetch")]) {
    const h = harness(t, {
      items: [line("guest")],
      getCart: async () => remote([["gone", 2, "hidden"], ["v1", 3, "p1"]]),
      getProduct: async (id) => {
        if (id === "hidden") throw error;
        return product();
      },
    });
    h.render();
    await settle();
    assert.deepEqual(h.items(), [line("guest")], "no partial hydration on unknown failure");
    h.edit([line("guest", 4)]);
    h.storageEvent();
    await h.advance(1000);
    assert.equal(h.calls.updateCart.length, 0);
    assert.equal(h.warnings.length, 1);
  }
});

test("logout clears an owned cart and detaches the prior account's listeners and timers", async (t) => {
  const h = harness(t, { items: [line()], owner: "A" });
  h.render();
  await settle();
  assert.equal(h.timerCount(), 1);
  h.render(null);
  assert.deepEqual(h.items(), []);
  assert.equal(h.localStorage.getItem(ownerKey), null);
  assert.equal(h.listenerCount(), 0);
  await h.advance(1000);
  assert.equal(h.calls.updateCart.length, 0);
});

test("logged-out guest carts without an owner remain intact", async (t) => {
  const h = harness(t, { items: [line("guest", 3)] });
  h.render(null);
  await h.advance(1000);
  assert.deepEqual(h.items(), [line("guest", 3)]);
  assert.equal(h.localStorage.getItem(ownerKey), null);
  assert.equal(h.calls.getCart.length, 0);
  assert.equal(h.calls.updateCart.length, 0);
});

test("direct A-to-B switch cannot merge A's items or late response into B", async (t) => {
  const a = deferred();
  let reads = 0;
  const h = harness(t, {
    items: [line("A-only", 9)], owner: "A",
    getCart: () => ++reads === 1 ? a.promise : Promise.resolve(remote([["B-only", 2, "pB"]])),
    getProduct: async () => product({ id: "pB", variantId: "B-only", variants: [{ id: "B-only", priceAmount: 9999, currency: "JPY" }] }),
  });
  h.render("A");
  h.render("B");
  assert.deepEqual(h.items(), [], "A's snapshot must be cleared before B's GET resolves");
  await settle();
  a.resolve(remote([["A-only", 99]]));
  await settle();
  assert.deepEqual(h.items().map(({ variantId, qty }) => ({ variantId, qty })), [{ variantId: "B-only", qty: 2 }]);
  assert.equal(h.localStorage.getItem(ownerKey), "B");
  h.edit(h.items().map((item) => ({ ...item, qty: 4 })));
  await h.advance(300);
  assert.deepEqual(h.calls.updateCart, [[{ currency: "JPY", items: [{ variantId: "B-only", quantity: 4 }] }]]);
});

test("browser edits are debounced for 300ms and unrelated storage events are ignored", async (t) => {
  const h = harness(t, { items: [line()], getCart: async () => remote([["v1", 1]]) });
  h.render();
  await settle();
  await h.advance(300);
  h.edit([line("v1", 2)]);
  await h.advance(200);
  h.edit([line("v1", 3)]);
  await h.advance(299);
  assert.equal(h.calls.updateCart.length, 0);
  h.storageEvent("unrelated-key");
  await h.advance(1);
  assert.deepEqual(h.calls.updateCart, [[{ currency: "JPY", items: [{ variantId: "v1", quantity: 3 }] }]]);
  // A real cross-tab storage change must also schedule a write.
  h.localStorage.setItem(h.cart.cartStorageKey, JSON.stringify([line("v1", 4)]));
  h.storageEvent();
  await h.advance(300);
  assert.equal(h.calls.updateCart[1][0].items[0].quantity, 4);
});

test("PUTs are serialized and edits during a pending write send only the latest snapshot", async (t) => {
  const first = deferred();
  let writes = 0;
  const h = harness(t, {
    items: [line()], getCart: async () => remote([["v1", 1]]),
    updateCart: () => ++writes === 1 ? first.promise : Promise.resolve({}),
  });
  h.render();
  await settle();
  h.edit([line("v1", 2)]);
  await h.advance(300);
  h.edit([line("v1", 3)]);
  await h.advance(300);
  h.edit([line("v1", 4)]);
  await h.advance(300);
  assert.equal(h.calls.updateCart.length, 1, "no concurrent replacement requests");
  first.resolve({});
  await settle();
  await h.advance(299);
  assert.equal(h.calls.updateCart.length, 1);
  await h.advance(1);
  assert.deepEqual(h.calls.updateCart.map(([payload]) => payload.items[0].quantity), [2, 4]);
  await h.advance(1000);
  assert.equal(h.calls.updateCart.length, 2);
});

test("failed PUT does not automatically retry the same payload, even when it was queued", async (t) => {
  const first = deferred();
  let writes = 0;
  const h = harness(t, {
    items: [line()], getCart: async () => remote([["v1", 1]]),
    updateCart: () => ++writes === 1 ? first.promise : Promise.resolve({}),
  });
  h.render();
  await settle();
  h.edit([line("v1", 2)]);
  await h.advance(300);
  h.storageEvent(null);
  await h.advance(300);
  first.reject(new Error("PUT failed"));
  await settle();
  await h.advance(5000);
  h.edit([line("v1", 2)]);
  h.storageEvent();
  await h.advance(5000);
  assert.equal(h.calls.updateCart.length, 1);
  assert.equal(h.warnings.length, 1);
  h.edit([line("v1", 3)]);
  await h.advance(300);
  assert.deepEqual(h.calls.updateCart.map(([payload]) => payload.items[0].quantity), [2, 3]);
});

test("cleanup ignores stale GET responses, including StrictMode-style remounts", async (t) => {
  const stale = deferred();
  let reads = 0;
  const h = harness(t, {
    items: [line()],
    getCart: () => ++reads === 1 ? stale.promise : Promise.resolve(remote([["v1", 3]])),
  });
  h.render();
  h.unmount();
  assert.equal(h.listenerCount(), 0);
  assert.equal(h.localStorage.getItem(ownerKey), "A", "cleanup must not detach the persisted owner");
  h.render();
  await settle();
  stale.resolve(remote([["v1", 99]]));
  await settle();
  assert.equal(h.items()[0].qty, 3);
  assert.equal(h.listenerCount(), 2);
  await h.advance(1000);
  assert.equal(h.calls.updateCart.length, 0);
});

test("cleanup ignores pending hydration and removes scheduled timers and listeners", async (t) => {
  const hydration = deferred();
  const h = harness(t, {
    items: [line("local")], getCart: async () => remote([["v1", 2, "p1"]]),
    getProduct: () => hydration.promise,
  });
  h.render();
  await settle();
  assert.equal(h.calls.getProduct.length, 1);
  h.unmount();
  hydration.resolve(product());
  await settle();
  assert.deepEqual(h.items(), [line("local")]);
  assert.equal(h.listenerCount(), 0);
  assert.equal(h.timerCount(), 0);
  h.edit([line("local", 5)]);
  h.storageEvent();
  await h.advance(1000);
  assert.equal(h.calls.updateCart.length, 0);
});

test("edits and removals during hydration are preserved instead of resurrecting initial lines", async (t) => {
  const hydration = deferred();
  const h = harness(t, {
    items: [line("removed", 2), line("edited", 2)],
    getCart: async () => remote([["removed", 8], ["edited", 9], ["v1", 3, "p1"]]),
    getProduct: () => hydration.promise,
  });
  h.render();
  await settle();
  h.edit([line("edited", 1), line("new", 4)]);
  hydration.resolve(product());
  await settle();
  assert.deepEqual(h.items().map(({ variantId, qty }) => ({ variantId, qty })), [
    { variantId: "edited", qty: 1 }, { variantId: "new", qty: 4 }, { variantId: "v1", qty: 3 },
  ]);
  await h.advance(300);
  assert.deepEqual(h.calls.updateCart, [[{ currency: "JPY", items: [
    { variantId: "edited", quantity: 1 }, { variantId: "new", quantity: 4 }, { variantId: "v1", quantity: 3 },
  ] }]]);
});