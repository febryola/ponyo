import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function compile(path) {
    return ts.transpileModule(
        readFileSync(new URL(path,
            import.meta.url), "utf8"), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
                jsx: ts.JsxEmit.ReactJSX,
            },
        },
    ).outputText;
}
const helperSource = compile("../src/lib/cart-validation.ts");
const apiSource = compile("../src/services/ponyo-api.client.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const item = (extra = {}) => ({
    id: "local-a",
    variantId: "variant-a",
    catalogId: "old-product",
    slug: "old-slug",
    name: "Original plush",
    maker: "Original maker",
    price: 1000,
    currency: "JPY",
    image: "/old.png",
    imageAlt: "Old image",
    qty: 2,
    ...extra,
});
const line = (extra = {}) => ({
    variantId: "variant-a",
    productId: "product-a",
    quantity: 2,
    name: "Current plush",
    maker: "Current maker",
    slug: "current-slug",
    priceAmount: 1200,
    currency: "JPY",
    image: "/new.png",
    imageAlt: "New image",
    availableQuantity: 5,
    availability: "available",
    issues: ["price_changed"],
    priceChanged: true,
    ...extra,
});
const response = (lines, extra = {}) => ({
    items: lines,
    canCheckout: lines.length > 0 && lines.every((entry) => !entry.issues.length),
    subtotalAmount: 2400,
    sourceCurrency: "JPY",
    ...extra,
});

function helper(result, configured = true) {
    const requests = [];
    const context = {
        exports: {},
        require: () => ({
            PONYO_API_BASE_URL: configured ? "/ponyo-api" : "",
            ponyoApi: {
                validateCart: async(input) => {
                    requests.push(plain(input));
                    if (result instanceof Error) throw result;
                    return result;
                },
            },
        }),
    };
    vm.runInNewContext(helperSource, context);
    return {...context.exports, requests };
}

test("refresh sends expected prices and adapts metadata without changing line identity", async() => {
    const api = helper(response([line()]));
    const original = item();
    const result = await api.refreshCartItems([original], "USD");
    assert.deepEqual(api.requests, [{
        currency: "USD",
        items: [{
            variantId: "variant-a",
            quantity: 2,
            expectedPriceAmount: 1000,
            expectedCurrency: "JPY",
        }, ],
    }, ]);
    assert.deepEqual(plain(result.items[0]), {
        ...original,
        catalogId: "product-a",
        slug: "current-slug",
        name: "Current plush",
        maker: "Current maker",
        price: 1200,
        image: "/new.png",
        imageAlt: "New image",
        availability: "available",
        availableQuantity: 5,
        validationIssue: "price_changed",
    });
    assert.equal(result.validation.canCheckout, false);
    assert.equal(original.price, 1000);
});

test("hidden products retain all original display data and remain removable", async() => {
    const api = helper(
        response([
            line({
                productId: null,
                priceAmount: null,
                currency: null,
                name: "Product unavailable",
                image: null,
                imageAlt: null,
                maker: null,
                slug: null,
                availability: "unavailable",
                availableQuantity: 0,
                issues: ["product_unavailable"],
                priceChanged: false,
            }),
        ]),
    );
    const original = item();
    const result = await api.refreshCartItems([original], "JPY");
    assert.deepEqual(plain(result.items), [{
        ...original,
        availability: "unavailable",
        availableQuantity: 0,
        validationIssue: "product_unavailable",
    }, ]);
    assert.equal(result.validation.canCheckout, false);
});

test("insufficient stock updates live price but never clamps quantity", async() => {
    const api = helper(
        response([
            line({
                quantity: 99,
                availability: "unavailable",
                availableQuantity: 1,
                issues: ["insufficient_stock", "price_changed"],
            }),
        ]),
    );
    const result = await api.refreshCartItems([item({ qty: 99 })], "JPY");
    assert.equal(result.items[0].qty, 99);
    assert.equal(result.items[0].price, 1200);
    assert.equal(result.items[0].availability, "unavailable");
    assert.equal(api.requests[0].items[0].quantity, 99);
});

test("missing live variants are preserved and block checkout rather than using demo", async() => {
    const api = helper(response([line({ issues: [], priceChanged: false })]));
    const demo = item({ id: "demo", variantId: undefined });
    const result = await api.refreshCartItems([item(), demo], "JPY");
    assert.equal(result.items.length, 2);
    assert.equal(result.items[1].name, demo.name);
    assert.equal(result.items[1].validationIssue, "product_unavailable");
    assert.equal(result.validation.canCheckout, false);
    assert.equal(api.requests[0].items.length, 1);
});

test("currency changes are refreshed and require review", async() => {
    const api = helper(
        response([
            line({ currency: "USD", priceAmount: 20, issues: ["currency_changed"] }),
        ]),
    );
    const result = await api.refreshCartItems([item()], "USD");
    assert.equal(result.items[0].currency, "USD");
    assert.equal(result.items[0].price, 20);
    assert.equal(result.validation.canCheckout, false);
});

test("accepted current expectations clear the price notice and permit checkout", async() => {
    const api = helper(response([line({ issues: [], priceChanged: false })]));
    const result = await api.refreshCartItems([item({ price: 1200 })], "JPY");
    assert.equal(result.validation.canCheckout, true);
    assert.equal(result.items[0].validationIssue, undefined);
});

test("response order cannot swap lines or collapse distinct variant keys", async() => {
    const api = helper(
        response([
            line({ variantId: "variant-b", priceAmount: 2000, issues: [] }),
            line({ issues: [] }),
        ]),
    );
    const result = await api.refreshCartItems(
        [item(), item({ id: "local-b", variantId: "variant-b" })],
        "JPY",
    );
    assert.deepEqual(
        plain(
            result.items.map(({ id, variantId, price }) => [id, variantId, price]),
        ), [
            ["local-a", "variant-a", 1200],
            ["local-b", "variant-b", 2000],
        ],
    );
});

test("mixed currency lines remain intact and cannot check out", async() => {
    const api = helper(
        response(
            [
                line({ issues: ["mixed_currency"] }),
                line({
                    variantId: "variant-b",
                    currency: "USD",
                    issues: ["mixed_currency"],
                }),
            ], { sourceCurrency: null, subtotalAmount: 0 },
        ),
    );
    const result = await api.refreshCartItems(
        [item(), item({ id: "local-b", variantId: "variant-b" })],
        "JPY",
    );
    assert.equal(result.items.length, 2);
    assert.equal(result.items[1].currency, "USD");
    assert.equal(result.validation.canCheckout, false);
});

test("invalid quantities, duplicate identities and line limits fail without clamping", async() => {
    const api = helper(response([]));
    for (const qty of[0, -1, 100, 1.5])
        await assert.rejects(
            api.refreshCartItems([item({ qty })], "JPY"),
            /1 to 99/,
        );
    await assert.rejects(
        api.refreshCartItems([item(), item({ id: "other" })], "JPY"),
        /Duplicate/,
    );
    await assert.rejects(
        api.refreshCartItems([item(), item({ variantId: "other" })], "JPY"),
        /Duplicate/,
    );
    await assert.rejects(
        api.refreshCartItems(
            Array.from({ length: 101 }, (_, index) =>
                item({ id: String(index), variantId: String(index) }),
            ),
            "JPY",
        ),
        /100 lines/,
    );
    assert.equal(api.requests.length, 0);
});

test("incomplete, duplicate or wrong-quantity responses fail closed", async() => {
    for (const lines of[
            [], [line({ quantity: 1 })], [line(), line()], [line({ variantId: "other" })],
        ]) {
        await assert.rejects(
            helper(response(lines)).refreshCartItems([item()], "JPY"),
            /incomplete snapshot/,
        );
    }
});

test("API failures propagate; offline demo returns original lines without network calls", async() => {
    await assert.rejects(
        helper(new Error("Offline")).refreshCartItems([item()], "JPY"),
        /Offline/,
    );
    const api = helper(undefined, false);
    const items = [item({ variantId: undefined })];
    const result = await api.refreshCartItems(items, "JPY");
    assert.equal(result.items, items);
    assert.equal(result.validation, null);
    assert.equal(api.requests.length, 0);
});

test("request key ignores refreshed metadata but tracks identity, quantity and currency", () => {
    const { cartValidationKey: key } = helper(undefined);
    assert.equal(
        key([item()], "JPY"),
        key(
            [
                item({
                    name: "Updated",
                    price: 2000,
                    currency: "USD",
                    availability: "unavailable",
                }),
            ],
            "JPY",
        ),
    );
    for (const changed of[{ id: "other" }, { variantId: "other" }, { qty: 3 }])
        assert.notEqual(key([item()], "JPY"), key([item(changed)], "JPY"));
    assert.notEqual(key([item()], "JPY"), key([item()], "USD"));
});

test("public validation POST unwraps response and does not bootstrap CSRF", async() => {
    const requests = [];
    const data = response([line()]);
    const context = {
        exports: {},
        process: { env: { NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" } },
        window: {},
        Headers,
        URLSearchParams,
        fetch: async(url, init) => {
            requests.push({ url, init });
            return { ok: true, json: async() => ({ data }) };
        },
    };
    vm.runInNewContext(apiSource, context);
    const input = {
        currency: "JPY",
        items: [{
            variantId: "variant-a",
            quantity: 2,
            expectedPriceAmount: 1000,
            expectedCurrency: "JPY",
        }, ],
    };
    assert.equal(await context.exports.ponyoApi.validateCart(input), data);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/ponyo-api/v1/cart/validate");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.headers.has("X-CSRF-Token"), false);
    assert.deepEqual(JSON.parse(requests[0].init.body), input);
});

const checkoutSource = compile(
    "../src/components/layout/checkout-page-client.tsx",
);
const quotedTotals = {
    subtotalAmount: 2000,
    discountAmount: 200,
    shippingAmount: 0,
    taxAmount: 180,
    totalAmount: 1980,
    currency: "JPY",
    couponCode: null,
    taxRateBps: 1000,
};

function reviewedQuoteKey(items, currency = "JPY") {
    return JSON.stringify({
        email: "customer@example.test",
        shippingAddress: {
            firstName: "",
            lastName: "",
            address1: "",
            address2: "",
            region: "",
            city: "",
            postalCode: "",
            phone: "",
            countryCode: "JP",
        },
        shippingMethod: "standard",
        paymentMethod: "card",
        currency,
        items: items.map((entry) => ({
            variantId: entry.variantId,
            quantity: entry.qty,
            expectedPriceAmount: entry.price,
            expectedCurrency: entry.currency,
        })),
    });
}

function checkoutHarness({
    refresh,
    create,
    quote: quoteResponse,
    reviewed = true,
    offline = false,
    buyNow = false,
    currency = "JPY",
} = {}) {
    let stored = [item()];
    let buyStored = JSON.stringify(stored[0]);
    const sessionValues = new Map();
    let stateIndex = 0;
    const states = [];
    const calls = {
        create: 0,
        redirect: 0,
        preview: 0,
        save: 0,
        quote: [],
        session: [],
    };
    const jsx = (type, props) => ({ type, props });
    const context = {
        exports: {},
        URL,
        crypto: { randomUUID: () => "checkout-test-idempotency-key" },
        Error,
        window: {
            sessionStorage: {
                getItem: (key) =>
                    key === "ponyo:buy-now-item" ?
                    buyStored :
                    sessionValues.has(key) ?
                    sessionValues.get(key) :
                    null,
                setItem: (key, value) => {
                    if (key === "ponyo:buy-now-item") buyStored = value;
                    else sessionValues.set(key, value);
                },
                removeItem: (key) => {
                    if (key === "ponyo:buy-now-item") buyStored = null;
                    else sessionValues.delete(key);
                },
            },
            location: {
                origin: "https://shop.example.test",
                assign: () => {
                    calls.redirect++;
                },
            },
            dispatchEvent: () => {},
            scrollTo: () => {},
        },
        CustomEvent: class {},
        require(name) {
            if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
            if (name === "react")
                return {
                    useEffect: () => {},
                    useRef: (current) => ({ current }),
                    useState(initial) {
                        const index = stateIndex++;
                        // Existing submit tests start at review with a server quote already reviewed.
                        if (!(index in states))
                            states[index] =
                            index === 10 && reviewed ?
                            {
                                inputKey: reviewedQuoteKey(stored, currency),
                                quote: {...quotedTotals, currency },
                            } :
                            index === 2 ?
                            2 :
                            buyNow && index === 0 ?
                            stored[0] :
                            buyNow && index === 1 ?
                            true :
                            typeof initial === "function" ?
                            initial() :
                            initial;
                        return [
                            states[index],
                            (value) => {
                                states[index] = value;
                            },
                        ];
                    },
                };
            if (name === "next/navigation")
                return { useRouter: () => ({ push: () => {} }) };
            if (name === "@/lib/cart")
                return {
                    useCartItems: () => stored,
                    readCart: () => stored,
                    saveCart: (next) => {
                        calls.save++;
                        stored = next;
                    },
                };
            if (name === "@/lib/cart-validation")
                return { refreshCartItems: (...args) => refresh(...args) };
            if (name === "@/lib/local-orders")
                return {
                    saveLocalOrder: () => {
                        calls.preview++;
                    },
                };
            if (name === "@/components/layout/localization-provider")
                return {
                    useLocalization: () => ({
                        language: "en",
                        t: (_, fallback, values = {}) => fallback.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => String(values[key] ?? match)),
                        currency,
                        country: "JP",
                        deliveryCountries: [{ code: "JP", label: "Japan" }],
                        formatPrice: String,
                        convertMajorAmount: (value) => value,
                    }),
                };
            if (name === "@/lib/localization-options")
                return { regionName: (_, __, fallback) => fallback };
            if (name === "@/components/layout/customer-session-provider")
                return {
                    useCustomerSession: () => ({
                        customer: { email: "customer@example.test" },
                        setCustomer: () => {},
                        isLoading: false,
                    }),
                };
            if (name === "@/services/ponyo-api.client")
                return {
                    PONYO_API_BASE_URL: offline ? "" : "/ponyo-api",
                    ApiRequestError: class extends Error {},
                    ApiNotConfiguredError: class extends Error {},
                    ponyoApi: {
                        getCheckoutQuote: async(input) => {
                            calls.quote.push(plain(input));
                            return quoteResponse ? quoteResponse(input) : quotedTotals;
                        },
                        createCheckoutSession: async(...args) => {
                            calls.create++;
                            calls.session.push(plain(args[0]));
                            return create ?
                                create(...args) :
                                {
                                    ...quotedTotals,
                                    checkoutUrl: "https://checkout.stripe.com/test",
                                };
                        },
                    },
                };
            return { default: name };
        },
    };
    vm.runInNewContext(checkoutSource, context);
    let tree;

    function render() {
        stateIndex = 0;
        tree = context.exports.CheckoutPageClient({ buyNow });
    }
    render();

    function find(
        node,
        predicate = (entry) =>
        entry.props &&
        entry.props.onClick &&
        entry.props.onClick.name === "placeLocalOrder",
    ) {
        if (!node || typeof node !== "object") return;
        if (predicate(node)) return node;
        for (const child of[node.props && node.props.children].flat(Infinity)) {
            const found = find(child, predicate);
            if (found) return found;
        }
    }
    return {
        submit: find(tree).props.onClick,
        calls,
        states,
        render,
        find: (predicate) => find(tree, predicate),
        items: () => stored,
        buyItem: () => JSON.parse(buyStored),
        edit: (next) => {
            stored = next;
            buyStored = JSON.stringify(next[0]);
        },
        requestQuote: () =>
            find(
                tree,
                (node) => node.type === "form" && node.props["aria-busy"] !== undefined,
            ).props.onSubmit({ preventDefault() {} }),
    };
}
const checked = (items) => ({
    items,
    validation: response([
        line({ priceAmount: 1000, issues: [], priceChanged: false }),
    ]),
});

test("checkout price changes update review without creating a payment session", async() => {
    const page = checkoutHarness({
        refresh: async(items) => ({
            items: items.map((entry) => ({...entry, price: 1200 })),
            validation: response([line()]),
        }),
    });
    await page.submit();
    assert.equal(page.items()[0].price, 1200);
    assert.equal(page.calls.create, 0);
    assert.equal(page.calls.preview, 0);
    assert.match(page.states[8], /Prices or currencies changed/);
});

test("buy-now changes update only the buy-now snapshot and require review", async() => {
    const page = checkoutHarness({
        buyNow: true,
        refresh: async(items) => ({
            items: items.map((entry) => ({...entry, price: 1200 })),
            validation: response([line()]),
        }),
    });
    await page.submit();
    assert.equal(page.buyItem().price, 1200);
    assert.equal(page.calls.save, 0);
    assert.equal(page.calls.create, 0);
});

test("edits during validation cannot be overwritten or sent to payment", async() => {
    let finish;
    const page = checkoutHarness({
        refresh: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    });
    const pending = page.submit();
    page.edit([item({ qty: 3 })]);
    finish(checked([item()]));
    await pending;
    assert.equal(page.items()[0].qty, 3);
    assert.equal(page.calls.save, 0);
    assert.equal(page.calls.create, 0);
    assert.match(page.states[8], /changed during checkout/);
});

test("edits during payment creation prevent stale redirect and duplicate submits", async() => {
    let finish;
    const page = checkoutHarness({
        refresh: async(items) => checked(items),
        create: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    });
    const pending = page.submit();
    await new Promise((resolve) => setImmediate(resolve));
    await page.submit();
    page.edit([item({ qty: 4 })]);
    finish({ checkoutUrl: "https://checkout.stripe.com/test" });
    await pending;
    assert.equal(page.calls.create, 1);
    assert.equal(page.calls.redirect, 0);
    assert.equal(page.items()[0].qty, 4);
});

test("stock failures and validation errors block payment without a demo fallback", async() => {
    for (const refresh of[
            async(items) => ({
                items,
                validation: response([line({ issues: ["insufficient_stock"] })]),
            }),
            async() => {
                throw new Error("Service unavailable");
            },
        ]) {
        const page = checkoutHarness({ refresh });
        await page.submit();
        assert.equal(page.calls.create, 0);
        assert.equal(page.calls.preview, 0);
        assert.ok(page.states[8]);
    }
});

test("unchanged validated checkout creates payment; offline checkout remains a demo", async() => {
    const live = checkoutHarness({ refresh: async(items) => checked(items) });
    await live.submit();
    assert.equal(live.calls.create, 1);
    assert.equal(live.calls.redirect, 1);
    assert.equal(
        live.calls.session[0].expectedTotalAmount,
        quotedTotals.totalAmount,
    );
    assert.equal(
        live.calls.session[0].idempotencyKey,
        "checkout-test-idempotency-key",
    );
    assert.equal(
        live.calls.quote.length,
        0,
        "submission must not silently replace the reviewed quote",
    );
    const offline = checkoutHarness({ offline: true });
    await offline.submit();
    assert.equal(offline.calls.create, 0);
    assert.equal(offline.calls.preview, 1);
});

test("missing reviewed quote blocks payment after the existing cart refresh", async() => {
    const page = checkoutHarness({
        reviewed: false,
        refresh: async(items) => checked(items),
    });
    await page.submit();
    assert.equal(page.calls.save, 1, "pre-checkout refresh remains intact");
    assert.equal(page.calls.create, 0);
    assert.equal(page.calls.quote.length, 0);
    assert.match(page.states[8], /updated quote/);
});

test("quotes are explicit and coupon edits require a new quote", async() => {
    const page = checkoutHarness({
        reviewed: false,
        refresh: async(items) => checked(items),
    });
    page.render();
    assert.equal(page.calls.quote.length, 0, "renders do not request quotes");
    const coupon = page.find(
        (node) => node.props && node.props.id === "checkout-coupon",
    );
    coupon.props.onChange({ target: { value: " SAVE10 " } });
    page.render();
    page.requestQuote();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.calls.quote.length, 1);
    assert.equal(page.calls.quote[0].couponCode, "SAVE10");
    assert.equal(page.calls.quote[0].items[0].expectedPriceAmount, 1000);
    assert.match(page.calls.quote[0].successUrl, /\{CHECKOUT_SESSION_ID\}/);
    page.render();
    await page
        .find(
            (node) =>
            node.props &&
            node.props.onClick &&
            node.props.onClick.name === "placeLocalOrder",
        )
        .props.onClick();
    assert.equal(page.calls.session[0].couponCode, "SAVE10");
    assert.equal(page.calls.session[0].expectedTotalAmount, 1980);
});

test("quote failures and cart edits during a quote fail closed without payment", async() => {
    let finish;
    const page = checkoutHarness({
        reviewed: false,
        quote: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    });
    page.requestQuote();
    page.requestQuote();
    assert.equal(
        page.calls.quote.length,
        1,
        "duplicate quote requests are locked",
    );
    page.edit([item({ qty: 3 })]);
    finish(quotedTotals);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.states[10], null);
    assert.match(page.states[8], /details changed/);
    assert.equal(page.calls.create, 0);
    const failed = checkoutHarness({
        reviewed: false,
        quote: async() => {
            throw new Error("Coupon has expired");
        },
    });
    failed.requestQuote();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(failed.states[10], null);
    assert.equal(failed.states[8], "Coupon has expired");
});

test("invalid quote totals are rejected and a changed-total session rejection requires requoting", async() => {
    const invalid = checkoutHarness({
        reviewed: false,
        quote: async() => ({...quotedTotals, totalAmount: -1 }),
    });
    invalid.requestQuote();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(invalid.states[10], null);
    assert.match(invalid.states[8], /invalid quote/);
    const changed = checkoutHarness({
        refresh: async(items) => checked(items),
        create: async() => {
            throw new Error("Checkout total changed");
        },
    });
    await changed.submit();
    assert.equal(changed.calls.redirect, 0);
    assert.equal(changed.calls.session[0].expectedTotalAmount, 1980);
    assert.equal(changed.states[10], null);
    assert.match(changed.states[8], /total changed/);
});

test("server summary formats USD minor units without local FX conversion", () => {
    const page = checkoutHarness({ currency: "USD" });
    const summary = page.find(
        (node) => node.props && node.props.className === "checkout-totals",
    );
    const rows = summary.props.children;
    assert.equal(rows[0].props.children[1].props.children, "$20.00");
    assert.equal(rows[1].props.children[1].props.children, "-$2.00");
    assert.equal(rows[3].props.children[1].props.children, "$1.80");
    assert.equal(rows[4].props.children[1].props.children, "$19.80");
});

test("returning to payment and entering review requests exactly one quote", async() => {
    const page = checkoutHarness({ reviewed: false });
    page.states[2] = 1;
    page.render();
    const form = page.find(
        (node) =>
        node.props &&
        node.props.onSubmit &&
        node.props.onSubmit.name === "continueToReview",
    );
    form.props.onSubmit({ preventDefault() {} });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.states[2], 2);
    assert.equal(page.calls.quote.length, 1);
    page.render();
    assert.equal(
        page.calls.quote.length,
        1,
        "rendering review must not request another quote",
    );
});

test("a mismatched payment-session total never redirects", async() => {
    const page = checkoutHarness({
        refresh: async(items) => checked(items),
        create: async() => ({
            ...quotedTotals,
            totalAmount: 9999,
            checkoutUrl: "https://checkout.stripe.com/test",
        }),
    });
    await page.submit();
    assert.equal(page.calls.redirect, 0);
    assert.equal(page.states[10], null);
    assert.match(page.states[8], /payment total changed/);
});