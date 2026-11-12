import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(
  readFileSync(new URL("../src/components/account/account-drawer.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const profile = { id: "customer-1", firstName: "Ponyo", email: "buyer@example.com" };

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) { const result = find(child, predicate); if (result) return result; }
    return undefined;
  }
  return predicate(node) ? node : find(node.props?.children, predicate);
}

// Execute the real transpiled component with dependency-aware effects, committed
// dialog refs, stable hook setters/router and explicit render/cleanup boundaries.
function harness(t, { customer = null, isLoading = false, baseUrl = "/ponyo-api" } = {}) {
  const hooks = [];
  const listeners = new Map();
  const calls = { pushes: [], session: [], getMe: 0, showModal: 0, close: 0, lateState: 0 };
  let cursor = 0;
  let pendingEffects = [];
  let dirty = false;
  let mounted = true;
  let session = { customer, isLoading };
  function AccountAuthForm() { assert.fail("The drawer test must not execute the child auth form"); }
  const dialog = {
    open: false,
    showModal() { calls.showModal++; this.open = true; },
    close() { calls.close++; this.open = false; },
  };
  const router = { push: (href) => calls.pushes.push(href) };
  const setCustomer = (value) => {
    calls.session.push(value);
    session = { ...session, customer: value };
    dirty = true;
  };
  const context = {
    exports: {},
    window: {
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
      },
      removeEventListener: (type, listener) => listeners.get(type)?.delete(listener),
    },
    require(id) {
      if (id === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!hooks[index]) hooks[index] = {
            value: initial,
            set(value) {
              if (!mounted) { calls.lateState++; return; }
              const next = typeof value === "function" ? value(hooks[index].value) : value;
              if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
            },
          };
          return [hooks[index].value, hooks[index].set];
        },
        useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
        useEffect(effect, deps) {
          const index = cursor++;
          const previous = hooks[index];
          if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
            pendingEffects.push(() => {
              previous?.cleanup?.();
              hooks[index] = { deps: Array.from(deps), cleanup: effect() };
            });
          }
        },
      };
      if (id === "next/navigation") return { useRouter: () => router };
      if (id === "next/link") return { default: "a" };
      if (id === "@/components/account/account-auth-form") return { AccountAuthForm };
      if (id === "@/components/layout/customer-session-provider") return {
        useCustomerSession: () => ({ ...session, setCustomer }),
      };
      if (id === "@/services/ponyo-api.client") return {
        PONYO_API_BASE_URL: baseUrl,
        ponyoApi: { logout: async () => {} },
      };
      if (id === "react/jsx-runtime") return require(id);
      throw new Error(`Unexpected account drawer import: ${id}`);
    },
  };
  vm.runInNewContext(source, context, { filename: "account-drawer.js" });

  function render() {
    assert.ok(mounted, "cannot render an unmounted drawer");
    let tree;
    let passes = 0;
    do {
      assert.ok(++passes < 20, "effects must settle without a render loop");
      dirty = false;
      cursor = 0;
      pendingEffects = [];
      tree = context.exports.AccountDrawer();
      assert.equal(tree.type, "dialog");
      tree.props.ref.current = dialog;
      for (const effect of pendingEffects) effect();
    } while (dirty);
    return tree;
  }
  function unmount() {
    if (!mounted) return;
    mounted = false;
    for (const hook of hooks) hook?.cleanup?.();
  }
  t.after(unmount);
  return {
    calls, dialog, render, unmount, AccountAuthForm,
    session: () => session,
    setSession(value) { session = { ...session, ...value }; return render(); },
    listenerCount: () => listeners.get("ponyo:account-open")?.size ?? 0,
    open() {
      for (const listener of [...(listeners.get("ponyo:account-open") ?? [])]) listener({ type: "ponyo:account-open" });
    },
  };
}

test("ponyo:account-open opens the guest drawer without navigation", (t) => {
  const h = harness(t, { baseUrl: "" });
  h.render();
  assert.equal(h.dialog.open, false);
  assert.equal(h.listenerCount(), 1);
  h.open();
  const tree = h.render();
  assert.equal(h.dialog.open, true);
  assert.equal(h.calls.showModal, 1);
  assert.ok(find(tree, (node) => node.props?.["aria-label"] === "Guest account"));
  assert.equal(h.calls.getMe, 0);
  assert.deepEqual(h.calls.pushes, []);
});

test("a session customer immediately navigates to /account without opening or probing", (t) => {
  const h = harness(t, { customer: profile });
  h.render();
  h.open();
  assert.deepEqual(h.calls.pushes, ["/account"], "navigation happens in the event handler");
  h.render();
  assert.equal(h.dialog.open, false);
  assert.equal(h.calls.showModal, 0);
  assert.equal(h.calls.getMe, 0);
  assert.deepEqual(h.calls.session, []);
});

test("the account-open listener uses the latest session customer after a provider update", (t) => {
  const h = harness(t);
  h.render();
  h.setSession({ customer: profile, isLoading: false });
  assert.equal(h.listenerCount(), 1, "the old guest listener is removed");
  h.open();
  h.render();
  assert.deepEqual(h.calls.pushes, ["/account"]);
  assert.equal(h.calls.showModal, 0);
  assert.equal(h.calls.getMe, 0);
});

test("drawer waits for the shared customer session without starting a duplicate request", async (t) => {
  const h = harness(t, { isLoading: true });
  h.render();
  h.open();
  const tree = h.render();
  assert.equal(h.dialog.open, true);
  assert.ok(find(tree, (node) => node.props?.role === "status"));
  assert.equal(h.calls.getMe, 0);
  assert.deepEqual(h.calls.pushes, []);
  h.setSession({ customer: profile, isLoading: false });
  h.render();
  assert.equal(h.dialog.open, false);
  assert.equal(h.calls.close, 1);
  assert.deepEqual(h.calls.pushes, ["/account"]);
  assert.deepEqual(h.calls.session, []);
  assert.equal(h.session().customer, profile);
  assert.equal(h.calls.getMe, 0, "the drawer must reuse the provider session request");
});

test("a guest session shows sign-in actions without starting a duplicate probe", (t) => {
  const h = harness(t);
  h.render();
  h.open();
  const tree = h.render();
  assert.equal(h.calls.getMe, 0);
  assert.equal(h.dialog.open, true);
  assert.equal(h.calls.close, 0);
  assert.ok(find(tree, (node) => node.props?.["aria-label"] === "Guest account"));
  assert.ok(find(tree, (node) => node.type === "button" && node.props.children === "Sign in"));
  assert.equal(find(tree, (node) => node.props?.role === "status"), undefined);
  assert.equal(find(tree, (node) => node.props?.role === "alert"), undefined);
  assert.deepEqual(h.calls.pushes, []);
  assert.deepEqual(h.calls.session, []);
  assert.equal(h.session().customer, null);
});

for (const mode of ["login", "register"]) {
  test(`${mode}: onAuthenticated updates the session, closes the drawer and pushes /`, (t) => {
    const h = harness(t, { baseUrl: "" });
    h.render();
    h.open();
    const label = mode === "login" ? "Sign in" : "Create account";
    find(h.render(), (node) => node.type === "button" && node.props.children === label).props.onClick();
    const form = find(h.render(), (node) => node.type === h.AccountAuthForm);
    assert.ok(form, "the real drawer supplies the authentication callback");
    assert.equal(form.props.mode, mode);
    assert.equal(form.props.presentation, "drawer");
    form.props.onAuthenticated(profile);
    const tree = h.render();
    assert.deepEqual(h.calls.session, [profile]);
    assert.equal(h.session().customer, profile);
    assert.equal(h.dialog.open, false);
    assert.equal(h.calls.close, 1);
    assert.deepEqual(h.calls.pushes, ["/"]);
    assert.equal(find(tree, (node) => node.type === h.AccountAuthForm), undefined);
  });
}

test("unmount removes the account-open listener", (t) => {
  const h = harness(t);
  h.render();
  h.unmount();
  assert.equal(h.listenerCount(), 0);
});