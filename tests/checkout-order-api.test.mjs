import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const { outputText } = ts.transpileModule(
    readFileSync(
        new URL("../src/services/ponyo-api.client.ts",
            import.meta.url),
        "utf8",
    ), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    },
);

function client({ cookie = "ponyo_csrf=test-csrf", result = {}, error } = {}) {
    const requests = [];
    const context = {
        exports: {},
        Headers,
        URLSearchParams,
        process: { env: { NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" } },
        window: {},
        document: { cookie },
        fetch: async(url, init) => {
            requests.push({ url, init });
            if (url.endsWith("/auth/csrf"))
                return {
                    ok: true,
                    json: async() => ({ data: { csrfToken: "bootstrap-csrf" } }),
                };
            return error ?
                { ok: false, status: error.status, json: async() => ({ error }) } :
                { ok: true, json: async() => ({ data: result }) };
        },
    };
    vm.runInNewContext(outputText, context);
    return {...context.exports, requests };
}

const input = {
    email: "customer@example.test",
    shippingAddress: {
        firstName: "Ponyo",
        lastName: "Customer",
        address1: "1 Main Street",
        city: "Tokyo",
        postalCode: "100-0001",
        countryCode: "JP",
    },
    shippingMethod: "standard",
    paymentMethod: "card",
    currency: "USD",
    couponCode: "SAVE10",
    items: [{
        variantId: "v1",
        quantity: 2,
        expectedPriceAmount: 1250,
        expectedCurrency: "JPY",
    }, ],
    successUrl: "https://shop.example.test/orders?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://shop.example.test/checkout",
};
const totals = {
    subtotalAmount: 2000,
    discountAmount: 200,
    shippingAmount: 100,
    taxAmount: 190,
    totalAmount: 2090,
    currency: "USD",
    couponCode: "SAVE10",
    taxRateBps: 1000,
};

test("quote POST unwraps exact server totals and preserves coupon, URLs and expected item prices", async() => {
    const { ponyoApi, requests } = client({ result: totals });
    assert.equal(await ponyoApi.getCheckoutQuote(input), totals);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/ponyo-api/v1/checkout/quote");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.cache, "no-store");
    assert.equal(requests[0].init.headers.get("X-CSRF-Token"), "test-csrf");
    assert.deepEqual(JSON.parse(requests[0].init.body), input);
});

test("session POST sends reviewed expectedTotalAmount and returns totals with payment session", async() => {
    const session = {
        ...totals,
        checkoutUrl: "https://checkout.stripe.com/test",
        orderId: "order-1",
        expiresAt: "2026-11-11T12:00:00Z",
    };
    const { ponyoApi, requests } = client({ result: session });
    const expected = {
        ...input,
        idempotencyKey: "checkout-key-1",
        expectedTotalAmount: totals.totalAmount,
    };
    assert.equal(await ponyoApi.createCheckoutSession(expected), session);
    assert.equal(requests[0].url, "/ponyo-api/v1/checkout/sessions");
    assert.deepEqual(JSON.parse(requests[0].init.body), expected);
});

test("order history uses encoded order identity and an authenticated no-store GET", async() => {
    const history = [{
        fromStatus: null,
        toStatus: "pending_payment",
        paymentStatus: "unpaid",
        fulfillmentStatus: "unfulfilled",
        source: "checkout",
        createdAt: "2026-11-11T12:00:00Z",
    }, ];
    const { ponyoApi, requests } = client({ result: history });
    assert.equal(await ponyoApi.getOrderHistory("order/1"), history);
    assert.equal(requests[0].url, "/ponyo-api/v1/orders/order%2F1/history");
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.cache, "no-store");
    assert.equal(requests[0].init.headers.has("X-CSRF-Token"), false);
});

test("cancel POST bootstraps CSRF and unwraps the confirmed order; reason is optional", async() => {
    const order = {
        id: "order-1",
        status: "cancelled",
        paymentStatus: "unpaid",
        ...totals,
    };
    const { ponyoApi, requests } = client({ cookie: "", result: order });
    assert.equal(
        await ponyoApi.cancelOrder("order/1", { reason: "Ordered by mistake" }),
        order,
    );
    assert.equal(requests[0].url, "/ponyo-api/v1/auth/csrf");
    assert.equal(requests[1].url, "/ponyo-api/v1/orders/order%2F1/cancel");
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.credentials, "include");
    assert.equal(requests[1].init.headers.get("X-CSRF-Token"), "bootstrap-csrf");
    assert.deepEqual(JSON.parse(requests[1].init.body), {
        reason: "Ordered by mistake",
    });
    await ponyoApi.cancelOrder("order-1");
    assert.deepEqual(JSON.parse(requests[2].init.body), {});
});

test("provider refusal or changed totals remain API errors, never optimistic success", async() => {
    const { ponyoApi, ApiRequestError } = client({
        error: {
            status: 409,
            code: "checkout_total_changed",
            message: "Review the updated total",
        },
    });
    await assert.rejects(
        ponyoApi.createCheckoutSession({
            ...input,
            idempotencyKey: "checkout-key-1",
            expectedTotalAmount: 1,
        }),
        (error) =>
        error instanceof ApiRequestError &&
        error.status === 409 &&
        error.code === "checkout_total_changed",
    );
    await assert.rejects(
        ponyoApi.cancelOrder("order-1"),
        (error) =>
        error instanceof ApiRequestError &&
        error.message === "Review the updated total",
    );
});

test("payment status GET unwraps provider details with encoded identity and authenticated no-store fetch", async() => {
    const payment = {
        orderId: "order/1",
        provider: "stripe",
        paymentStatus: "paid",
        orderStatus: "processing",
        totalAmount: 1250,
        currency: "USD",
        captureMethod: "automatic",
        capturedAmount: 1250,
        refundedAmount: 0,
        transactions: [{
            id: "tx-1",
            orderId: "order/1",
            provider: "stripe",
            kind: "capture",
            status: "succeeded",
            amount: 1250,
            currency: "USD",
            providerReference: "pi_1",
            reason: null,
            errorCode: null,
            createdAt: "2026-11-11T12:00:00Z",
        }, ],
    };
    const { ponyoApi, requests } = client({ result: payment });
    assert.equal(await ponyoApi.getPaymentStatus("order/1"), payment);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/ponyo-api/v1/payments/orders/order%2F1");
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.cache, "no-store");
    assert.equal(requests[0].init.headers.has("X-CSRF-Token"), false);
});

test("payment sync POST sends an empty JSON object with CSRF and unwraps the response", async() => {
    const payment = {
        orderId: "order/1",
        paymentStatus: "paid",
        transactions: [],
    };
    const { ponyoApi, requests } = client({ cookie: "", result: payment });
    assert.equal(await ponyoApi.syncPaymentStatus("order/1"), payment);
    assert.equal(requests[0].url, "/ponyo-api/v1/auth/csrf");
    const request = requests[1];
    assert.equal(request.url, "/ponyo-api/v1/payments/orders/order%2F1/sync");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.credentials, "include");
    assert.equal(request.init.cache, "no-store");
    assert.equal(request.init.headers.get("X-CSRF-Token"), "bootstrap-csrf");
    assert.equal(request.init.headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(request.init.body), {});
    await ponyoApi.syncPaymentStatus("order/1");
    assert.equal(requests.length, 3, "later sync requests reuse CSRF");
});

test("payment status and sync failures preserve API errors including authentication and provider errors", async() => {
    for (const status of[401, 403, 502]) {
        const { ponyoApi, ApiRequestError } = client({
            error: {
                status,
                code: "payment_sync_failed",
                message: "Unable to read provider payment",
            },
        });
        for (const method of["getPaymentStatus", "syncPaymentStatus"]) {
            await assert.rejects(
                ponyoApi[method]("order-1"),
                (error) =>
                error instanceof ApiRequestError &&
                error.status === status &&
                error.code === "payment_sync_failed" &&
                error.message === "Unable to read provider payment",
            );
        }
    }
});

test("getOrder returns the full BackendOrder rather than a checkout receipt after payment sync", async() => {
    const order = {
        id: "order/1",
        orderNumber: "PNY-1",
        status: "processing",
        paymentStatus: "paid",
        fulfillmentStatus: "unfulfilled",
        capturedAmount: 1250,
        refundedAmount: 0,
        captureMethod: "automatic",
        items: [],
        ...totals,
    };
    const { ponyoApi, requests } = client({ result: order });
    assert.equal(await ponyoApi.getOrder("order/1"), order);
    assert.equal(requests[0].url, "/ponyo-api/v1/orders/order%2F1");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.cache, "no-store");
});