import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
function dictionary(path, name) {
  const context = { exports: {} };
  vm.runInNewContext(compile(read(path)), context);
  return context.exports[name];
}
const auth = dictionary("src/locales/auth-translations.ts", "authTranslations");
const storefront = dictionary("src/locales/storefront-translations.ts", "storefrontTranslations");
const app = dictionary("src/locales/app-translations.ts", "appTranslations");
class ApiRequestError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
class ApiNotConfiguredError extends Error {}

function harness(component, { locale = "en", search = "?token=private-test-token", api = {}, baseUrl = "/ponyo-api" } = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  let cursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  const context = {
    exports: {}, Error, TypeError, URLSearchParams, Promise,
    window: { location: { search } },
    FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key]; } },
    require(id) {
      if (id === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
        },
        useRef(initial) { const index = refCursor++; return refs[index] ??= { current: initial }; },
        useEffect(effect) { const index = effectCursor++; effects[index] ??= effect; },
      };
      if (id === "next/link") return { default: "a" };
      if (id === "next/image") return { default: "img" };
      if (id.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => key }) };
      if (id === "@/components/layout/localization-provider") return { useLocalization: () => ({ t: (key, fallback) => auth[locale]?.[key] ?? storefront[locale]?.[key] ?? app[locale]?.[key] ?? fallback }) };
      if (id === "@/services/ponyo-api.client") return { ApiRequestError, ApiNotConfiguredError, PONYO_API_BASE_URL: baseUrl, ponyoApi: api };
      return require(id);
    },
  };
  const path = component === "reset" ? "src/components/account/account-password-reset-form.tsx" : "src/app/account/verify-email/page.tsx";
  vm.runInNewContext(compile(read(path)), context);
  return {
    render() { cursor = 0; refCursor = 0; effectCursor = 0; return component === "reset" ? context.exports.AccountPasswordResetForm() : context.exports.default(); },
    effect() { return effects[0](); },
    setLocale(value) { locale = value; },
    search() { return context.window.location.search; },
  };
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return undefined; }
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  return Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
}
function fill(h, value = "Fresh-password1!") {
  const tree = h.render();
  for (const name of ["password", "confirmation"]) find(tree, (n) => n.props?.name === name).props.onChange({ target: { value } });
}
async function submit(h, password = "Fresh-password1!", confirmation = password) {
  await find(h.render(), (n) => n.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { password, confirmation } });
  return h.render();
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

for (const locale of ["en", "es", "id", "ja", "ko", "zh-CN"]) {
  test(`${locale}: reviewed auth dictionary is complete and does not fall back to English`, () => {
    assert.deepEqual(Object.keys(auth[locale]).sort(), Object.keys(auth.en).sort());
    if (locale !== "en") for (const key of Object.keys(auth.en)) assert.notEqual(auth[locale][key], auth.en[key], key);
    const sources = ["src/components/account/account-auth-form.tsx", "src/components/account/account-password-reset-form.tsx", "src/app/account/verify-email/page.tsx"].map(read).join("\n");
    for (const [, key] of sources.matchAll(/t\("(account\.auth\.[^"]+)"/g)) {
      assert.ok(auth[locale][key] ?? storefront[locale]?.[key] ?? app[locale]?.[key] ?? (locale === "en"), key);
    }
  });

  test(`${locale}: password_unchanged keeps form, fields and token, localizes the alert, and allows a successful retry`, async () => {
    const calls = [];
    const h = harness("reset", { locale, api: { confirmPasswordReset: async (...args) => {
      calls.push(args);
      if (calls.length === 1) throw new ApiRequestError("Choose a new password that is different from your current password.", 422, "password_unchanged");
    } } });
    fill(h);
    let tree = await submit(h);
    assert.equal(text(find(tree, (n) => n.props?.role === "alert")), auth[locale]["account.auth.password_unchanged"]);
    const field = find(tree, (n) => n.props?.name === "password");
    assert.equal(field.props.value, "Fresh-password1!");
    assert.equal(field.props["aria-invalid"], true);
    assert.ok(field.props["aria-describedby"].includes("reset-password-error"));
    assert.equal(find(tree, (n) => n.props?.name === "confirmation").props.value, "Fresh-password1!");
    assert.equal(h.search(), "?token=private-test-token");
    assert.ok(find(tree, (n) => n.props?.href === "/account/forgot-password"));
    fill(h, "Different-password2!");
    tree = await submit(h, "Different-password2!");
    assert.equal(find(tree, (n) => n.type === "form"), undefined);
    assert.ok(text(tree).includes(auth[locale]["account.auth.password_updated"]));
    assert.deepEqual(calls, [["private-test-token", "Fresh-password1!"], ["private-test-token", "Different-password2!"]]);
    assert.ok(!text(tree).includes("private-test-token"));
  });

  test(`${locale}: reset policy, mismatch and missing-token failures never call the API`, async () => {
    for (const [options, password, confirmation, key] of [
      [{}, "short", "short", "password_policy"],
      [{}, "Fresh-password1!", "Other-password1!", "password_mismatch"],
      [{ search: "" }, "Fresh-password1!", "Fresh-password1!", "reset_missing_token"],
    ]) {
      const h = harness("reset", { locale, ...options, api: { confirmPasswordReset: () => assert.fail("Invalid form must not submit") } });
      const tree = await submit(h, password, confirmation);
      assert.equal(text(find(tree, (n) => n.props?.role === "alert")), auth[locale][`account.auth.${key}`]);
    }
  });

  test(`${locale}: verification Strict Mode replay verifies once, then translates success without replaying token`, async () => {
    let calls = 0;
    const h = harness("verify", { locale, api: { verifyEmail: async (token) => { calls++; assert.equal(token, "private-test-token"); } } });
    assert.ok(text(h.render()).includes(auth[locale]["account.auth.verify_loading"]));
    const cleanup = h.effect();
    cleanup();
    h.effect();
    await settle();
    let tree = h.render();
    assert.equal(calls, 1);
    assert.equal(text(find(tree, (n) => n.type === "h1")), auth[locale]["account.auth.verify_success_title"]);
    h.setLocale("en");
    tree = h.render();
    assert.equal(text(find(tree, (n) => n.type === "h1")), auth.en["account.auth.verify_success_title"]);
    assert.equal(calls, 1);
  });

  test(`${locale}: no-token verification shows a neutral resend flow and safe notice`, async () => {
    const calls = [];
    const h = harness("verify", { locale, search: "", api: {
      verifyEmail: () => assert.fail("No token must not verify"),
      resendVerificationEmail: async (email) => { calls.push(email); },
    } });
    h.render(); h.effect(); await settle();
    let tree = h.render();
    assert.equal(text(find(tree, (n) => n.type === "h1")), auth[locale]["account.auth.verify_request_title"]);
    find(tree, (n) => n.props?.id === "verification-email").props.onChange({ target: { value: "buyer@example.com" } });
    tree = h.render();
    await find(tree, (n) => n.type === "form").props.onSubmit({ preventDefault() {} });
    assert.deepEqual(calls, ["buyer@example.com"]);
    assert.ok(text(h.render()).includes(storefront[locale]?.["account.auth.resend_notice"] ?? "If this email belongs to a pending account, a new verification link has been sent. Check your inbox and spam folder."));
  });
}

test("verification failures provide an accessible localized recovery path", async () => {
  const h = harness("verify", { locale: "id", api: { verifyEmail: async () => { throw new ApiRequestError("Expired", 400, "invalid_token"); } } });
  h.render(); h.effect(); await settle();
  const tree = h.render();
  assert.equal(text(find(tree, (n) => n.props?.role === "alert")), auth.id["account.auth.verify_link_failed"]);
  assert.ok(find(tree, (n) => n.type === "form"));
  assert.ok(find(tree, (n) => n.props?.href === "/account/login"));
});

test("reset distinguishes network and expired-link errors and preserves unknown API details", async () => {
  for (const [error, expected] of [
    [new TypeError("Failed to fetch"), storefront.es["account.auth.service_unavailable"]],
    [new ApiRequestError("Expired", 400, "invalid_token"), auth.es["account.auth.reset_link_failed"]],
    [new ApiRequestError("Please wait before retrying", 429, "rate_limited"), "Please wait before retrying"],
  ]) {
    const h = harness("reset", { locale: "es", api: { confirmPasswordReset: async () => { throw error; } } });
    fill(h);
    const tree = await submit(h);
    assert.equal(text(find(tree, (n) => n.props?.role === "alert")), expected);
    assert.ok(find(tree, (n) => n.type === "form"));
  }
});

test("reset password visibility and pending submit remain accessible", async () => {
  let finish;
  const h = harness("reset", { api: { confirmPasswordReset: () => new Promise((resolve) => { finish = resolve; }) } });
  fill(h);
  let tree = h.render();
  const toggle = find(tree, (n) => n.props?.["aria-label"] === "Show password");
  toggle.props.onClick();
  tree = h.render();
  assert.equal(find(tree, (n) => n.props?.name === "password").props.type, "text");
  assert.equal(find(tree, (n) => n.props?.name === "confirmation").props.type, "text");
  assert.equal(find(tree, (n) => n.props?.["aria-label"] === "Hide password").props["aria-pressed"], true);
  const pending = submit(h);
  tree = h.render();
  assert.equal(find(tree, (n) => n.type === "form").props["aria-busy"], true);
  assert.equal(find(tree, (n) => n.props?.type === "submit").props.disabled, true);
  finish();
  await pending;
});

test("shared auth stylesheet stays opt-in, follows theme imports, and protects mobile inputs and keyboard focus", () => {
  const css = read("src/app/auth-studio.css");
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|})\s*([^{}]+)\{/g);
  for (const [, selector] of selectors) {
    if (selector.trim().startsWith("@")) continue;
    assert.ok(selector.trim().startsWith(".auth-studio"), selector);
  }
  assert.match(css, /input:not\(\[type="checkbox"\]\)[\s\S]*?font-size: 16px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  const layout = read("src/app/layout.tsx");
  assert.ok(layout.indexOf('"./auth-studio.css"') > layout.indexOf('"./collection-theme.css"'));
  const provider = read("src/components/layout/localization-provider.tsx");
  assert.match(provider, /const appValue = authTranslations\[language\]/);
});