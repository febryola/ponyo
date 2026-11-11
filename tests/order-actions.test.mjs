import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const { outputText } = ts.transpileModule(
    readFileSync(
        new URL("../src/components/account/order-actions.tsx",
            import.meta.url),
        "utf8",
    ), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
        },
    },
);

function harness({
    status = "pending_payment",
    paymentStatus = "unpaid",
    cancel,
    sync,
    getOrder,
    orderFields = {},
} = {}) {
    let order = {
        id: "order-id",
        orderNumber: "PNY-1",
        status,
        paymentStatus,
        currency: "USD",
        ...orderFields,
    };
    let stateIndex = 0;
    let refIndex = 0;
    const states = [];
    const refs = [];
    const calls = {
        cancel: [],
        updated: [],
        history: [],
        sync: [],
        getOrder: [],
    };
    const jsx = (type, props) => ({ type, props });
    const context = {
        exports: {},
        Error,
        require(name) {
            if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
            if (name === "react")
                return {
                    useState(initial) {
                        const index = stateIndex++;
                        if (!(index in states)) states[index] = initial;
                        return [
                            states[index],
                            (value) => {
                                states[index] = value;
                            },
                        ];
                    },
                    useRef(current) {
                        const index = refIndex++;
                        if (!refs[index]) refs[index] = { current };
                        return refs[index];
                    },
                };
            if (name === "@/services/ponyo-api.client")
                return {
                    ponyoApi: {
                        syncPaymentStatus: async(id) => {
                            calls.sync.push(id);
                            return sync ? sync() : paymentResult();
                        },
                        getOrder: async(id) => {
                            calls.getOrder.push(id);
                            return getOrder ?
                                getOrder() :
                                {...order, fulfillmentStatus: "unfulfilled" };
                        },
                        cancelOrder: async(id, input) => {
                            calls.cancel.push({ id, input });
                            return cancel ? cancel() : {...order, status: "cancelled" };
                        },
                        getOrderHistory: async(id) => {
                            calls.history.push(id);
                            return [];
                        },
                    },
                };
            throw new Error(`Unexpected import: ${name}`);
        },
    };
    vm.runInNewContext(outputText, context);
    let tree;

    function render() {
        stateIndex = 0;
        refIndex = 0;
        tree = context.exports.OrderActions({
            order,
            onUpdated(updated) {
                calls.updated.push(updated);
                order = updated;
            },
        });
    }

    function find(node, predicate) {
        if (!node || typeof node !== "object") return;
        if (predicate(node)) return node;
        for (const child of[node.props && node.props.children].flat(Infinity)) {
            const result = find(child, predicate);
            if (result) return result;
        }
    }
    render();
    return {
        calls,
        states,
        render,
        button: (text) =>
            find(
                tree,
                (node) => node.type === "button" && node.props.children === text,
            ),
        form: () => find(tree, (node) => node.type === "form"),
        reason: () => find(tree, (node) => node.type === "input"),
        text: () => JSON.stringify(tree),
        alert: () =>
            find(tree, (node) => node.props && node.props.role === "alert"),
    };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

function paymentResult(overrides = {}) {
    return {
        orderId: "order-id",
        provider: "stripe",
        paymentStatus: "paid",
        orderStatus: "processing",
        totalAmount: 1250,
        currency: "USD",
        captureMethod: "automatic",
        capturedAmount: 1250,
        refundedAmount: 0,
        transactions: [],
        ...overrides,
    };
}

test("only pending_payment + unpaid orders offer cancellation; activity loads on demand", async() => {
    for (const [status, paymentStatus] of[
            ["processing", "paid"], ["cancelled", "unpaid"], ["pending_payment", "paid"], ["pending_payment", "failed"],
        ]) {
        const page = harness({ status, paymentStatus });
        assert.equal(page.button("Cancel unpaid order"), undefined);
        assert.equal(page.calls.history.length, 0);
        page.button("View order activity").props.onClick();
        await settle();
        assert.deepEqual(page.calls.history, ["order-id"]);
    }
});

test("cancellation requires confirmation and only updates after the provider-backed response", async() => {
    let finish;
    const page = harness({
        cancel: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    });
    page.button("Cancel unpaid order").props.onClick();
    assert.equal(page.calls.cancel.length, 0);
    page.render();
    page.reason().props.onChange({ target: { value: " Changed my mind " } });
    page.render();
    page.form().props.onSubmit({ preventDefault() {} });
    page.form().props.onSubmit({ preventDefault() {} });
    assert.equal(
        page.calls.cancel.length,
        1,
        "duplicate cancellation is blocked synchronously",
    );
    assert.equal(
        page.calls.updated.length,
        0,
        "no optimistic cancellation or stock release",
    );
    assert.equal(page.calls.cancel[0].id, "order-id");
    assert.equal(page.calls.cancel[0].input.reason, "Changed my mind");
    finish({
        id: "order-id",
        orderNumber: "PNY-1",
        status: "cancelled",
        paymentStatus: "unpaid",
    });
    await settle();
    assert.equal(page.calls.updated[0].status, "cancelled");
    page.render();
    assert.equal(page.button("Cancel unpaid order"), undefined);
});

test("provider refusal leaves the order intact and surfaces its error", async() => {
    const page = harness({
        cancel: async() => {
            throw new Error("Payment provider has not confirmed expiry");
        },
    });
    page.button("Cancel unpaid order").props.onClick();
    page.render();
    page.form().props.onSubmit({ preventDefault() {} });
    await settle();
    assert.equal(page.calls.updated.length, 0);
    assert.match(page.states[2], /not confirmed expiry/);
    assert.equal(page.states[4], false);
});

test("payment sync refreshes the full order, renders confirmed amounts and removes cancellation", async() => {
    const canonical = {
        id: "order-id",
        orderNumber: "PNY-1",
        status: "processing",
        paymentStatus: "paid",
        currency: "USD",
        fulfillmentStatus: "processing",
    };
    const page = harness({ getOrder: async() => canonical });
    assert.equal(page.calls.sync.length, 0, "sync only runs on customer request");
    assert.equal(page.calls.getOrder.length, 0);
    page.button("Refresh payment status").props.onClick();
    await settle();
    page.render();
    assert.deepEqual(page.calls.sync, ["order-id"]);
    assert.deepEqual(page.calls.getOrder, ["order-id"]);
    assert.equal(page.calls.updated.at(-1), canonical);
    assert.match(page.text(), /stripe payment status/);
    assert.match(page.text(), /paid/);
    assert.match(page.text(), /\$12\.50/);
    assert.match(page.text(), /\$0\.00/);
    assert.equal(page.button("Cancel unpaid order"), undefined);
    assert.equal(page.button("Refresh payment status").props.disabled, false);
    assert.equal(page.alert(), undefined);
    assert.equal(page.button("Capture payment"), undefined);
    assert.equal(page.button("Refund payment"), undefined);
});

test("failed payment sync preserves order and amounts, displays the error and allows retry", async() => {
    let attempts = 0;
    const page = harness({
        sync: async() => {
            if (++attempts === 1) throw new Error("Payment provider unavailable");
            return paymentResult();
        },
        orderFields: { capturedAmount: 0, refundedAmount: 0 },
    });
    page.button("Refresh payment status").props.onClick();
    await settle();
    page.render();
    assert.equal(page.calls.updated.length, 0);
    assert.equal(page.calls.getOrder.length, 0);
    assert.match(page.text(), /Payment provider unavailable/);
    assert.ok(page.button("Cancel unpaid order"));
    assert.equal(page.button("Refresh payment status").props.disabled, false);
    page.button("Refresh payment status").props.onClick();
    await settle();
    page.render();
    assert.equal(page.calls.sync.length, 2);
    assert.equal(page.alert(), undefined);
    assert.equal(page.button("Cancel unpaid order"), undefined);
});

test("the subsequent canonical order controls cancellation if its status advanced after sync", async() => {
    const page = harness({
        sync: async() =>
            paymentResult({
                paymentStatus: "unpaid",
                orderStatus: "pending_payment",
                capturedAmount: 0,
            }),
        getOrder: async() => ({
            id: "order-id",
            orderNumber: "PNY-1",
            status: "processing",
            paymentStatus: "paid",
            currency: "USD",
        }),
    });
    page.button("Refresh payment status").props.onClick();
    await settle();
    page.render();
    assert.equal(page.calls.updated.at(-1).paymentStatus, "paid");
    assert.equal(page.button("Cancel unpaid order"), undefined);
});

test("duplicate syncs and cancellation are blocked until the full order refresh finishes", async() => {
    let finishSync;
    let finishOrder;
    const page = harness({
        sync: () =>
            new Promise((resolve) => {
                finishSync = resolve;
            }),
        getOrder: () =>
            new Promise((resolve) => {
                finishOrder = resolve;
            }),
    });
    page.button("Cancel unpaid order").props.onClick();
    page.render();
    const submitCancel = page.form().props.onSubmit;
    const refresh = page.button("Refresh payment status").props.onClick;
    refresh();
    refresh();
    submitCancel({ preventDefault() {} });
    assert.equal(page.calls.sync.length, 1);
    assert.equal(page.calls.cancel.length, 0);
    page.render();
    assert.equal(page.button("Refreshing payment status…").props.disabled, true);
    assert.equal(page.button("Confirm cancellation").props.disabled, true);
    finishSync(paymentResult());
    await settle();
    refresh();
    submitCancel({ preventDefault() {} });
    assert.equal(page.calls.sync.length, 1);
    assert.equal(page.calls.cancel.length, 0);
    finishOrder(page.calls.updated[0]);
    await settle();
    page.render();
    assert.equal(page.button("Refresh payment status").props.disabled, false);
    assert.equal(page.button("Cancel unpaid order"), undefined);
});

test("a failed order reload retains authoritative synced status and prevents stale cancellation", async() => {
    const page = harness({
        getOrder: async() => {
            throw new Error("Order reload unavailable");
        },
    });
    page.button("Refresh payment status").props.onClick();
    await settle();
    page.render();
    assert.equal(page.calls.updated.length, 1);
    assert.equal(page.calls.updated[0].status, "processing");
    assert.equal(page.calls.updated[0].capturedAmount, 1250);
    assert.equal(page.button("Cancel unpaid order"), undefined);
    assert.match(
        page.text(),
        /Payment status refreshed, but order details could not be reloaded/,
    );
    assert.match(page.text(), /Order reload unavailable/);
    assert.match(page.text(), /\$12\.50/);
});

test("payment refresh is blocked while cancellation is pending", async() => {
    let finish;
    const page = harness({
        cancel: () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    });
    const refresh = page.button("Refresh payment status").props.onClick;
    page.button("Cancel unpaid order").props.onClick();
    page.render();
    page.form().props.onSubmit({ preventDefault() {} });
    refresh();
    page.render();
    assert.equal(page.calls.sync.length, 0);
    assert.equal(page.button("Refresh payment status").props.disabled, true);
    finish({
        id: "order-id",
        orderNumber: "PNY-1",
        status: "cancelled",
        paymentStatus: "unpaid",
        currency: "USD",
    });
    await settle();
});

test("payment amounts honor USD, JPY, IDR and three-decimal minor units without FX", async() => {
    for (const [currency, capturedAmount, expected] of[
            ["USD", 1250, "$12.50"], ["JPY", 1250, "¥1,250"], ["IDR", 1250, "1,250"], ["KWD", 1250, "1.250"],
        ]) {
        const page = harness({
            sync: async() =>
                paymentResult({
                    currency,
                    capturedAmount,
                    refundedAmount: capturedAmount,
                }),
        });
        page.button("Refresh payment status").props.onClick();
        await settle();
        page.render();
        assert.ok(page.text().includes(expected), `${currency}: ${page.text()}`);
        assert.ok(page.text().includes("Captured:"));
        assert.ok(page.text().includes("Refunded:"));
    }
});