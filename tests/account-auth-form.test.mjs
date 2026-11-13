import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const translationContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL("../src/locales/storefront-translations.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, translationContext);
const authContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL("../src/locales/auth-translations.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, authContext);
const translations = Object.fromEntries(["en", "es", "id", "ja", "ko", "zh-CN"].map((locale) => [locale, {
  ...translationContext.exports.storefrontTranslations[locale], ...authContext.exports.authTranslations[locale],
}]));
const source = ts.transpileModule(
  readFileSync(new URL("../src/components/account/account-auth-form.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

class ApiRequestError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class ApiNotConfiguredError extends Error {}

// Render the component's element tree with deterministic hook state and API stubs.
function formHarness(error, presentation = "page", { locale = "en", mode = "login", api = {}, baseUrl = "/ponyo-api" } = {}) {
  const states = [];
  let cursor = 0;
  const requests = [];
  const context = {
    exports: {}, Error, TypeError,
    FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key]; } },
    require(id) {
      if (id === "react") return {
        useState(initial) {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
        },
        useEffect() {},
      };
      if (id === "next/link") return { default: "a" };
      if (id === "next/image") return { default: "img" };
      if (id === "next/navigation") return { useRouter: () => ({ push() { assert.fail("Failed login must not navigate"); } }) };
      if (id === "@/components/layout/customer-session-provider") return {
        useCustomerSession: () => ({ setCustomer() { assert.fail("Failed login must not authenticate"); } }),
      };
      if (id === "@/components/layout/localization-provider") return {
        useLocalization: () => ({ t: (key, fallback, values = {}) =>
          (translations[locale]?.[key] ?? fallback).replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => String(values[name] ?? match)) }),
      };
      if (id === "@/services/ponyo-api.client") return {
        ApiRequestError, ApiNotConfiguredError, PONYO_API_BASE_URL: baseUrl,
        ponyoApi: { login: async (...args) => { requests.push(args); throw error; }, ...api },
      };
      return require(id);
    },
  };
  vm.runInNewContext(source, context);
  return {
    requests,
    setLocale(next) { locale = next; },
    render() { cursor = 0; return context.exports.AccountAuthForm({ mode, presentation }); },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) { const result = find(child, predicate); if (result) return result; }
    return undefined;
  }
  return predicate(node) ? node : find(node.props?.children, predicate);
}

function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  return Array.isArray(node) ? node.map(text).join("") : text(node.props?.children);
}

async function submit(harness) {
  let tree = harness.render();
  find(tree, (node) => node.props?.name === "email").props.onChange({ target: { value: "buyer@example.com" } });
  find(tree, (node) => node.props?.name === "password").props.onChange({ target: { value: "wrong-password-123" } });
  tree = harness.render();
  await find(tree, (node) => node.type === "form").props.onSubmit({
    preventDefault() {}, currentTarget: { email: "buyer@example.com", password: "wrong-password-123" },
  });
  return harness.render();
}

for (const presentation of ["page", "drawer"]) {
  for (const [code, message, action, href, nextTitle] of [
    ["customer_not_found", "This email is not registered. Please create a Ponyo account.", "Create a Ponyo account", "/account/register", "Create your account"],
    ["invalid_password", "Incorrect password. Try again or reset your password.", "Forgot password?", "/account/forgot-password", "Reset your password"],
  ]) {
    test(`${presentation}: ${code} displays the appropriate recovery action`, async () => {
      const harness = formHarness(new ApiRequestError("Backend error", 401, code), presentation);
      const tree = await submit(harness);
      const alert = find(tree, (node) => node.props?.role === "alert");
      assert.ok(text(alert).includes(message));
      const recovery = find(alert, (node) => ["a", "button"].includes(node.type) && text(node).startsWith(action));
      assert.ok(recovery);
      assert.deepEqual(harness.requests, [["buyer@example.com", "wrong-password-123"]]);
      if (code === "invalid_password") assert.ok(!text(alert).includes("Create a Ponyo account"));
      if (presentation === "page") {
        assert.equal(recovery.props.href, href);
      } else {
        assert.equal(recovery.props.type, "button");
        recovery.props.onClick();
        const next = harness.render();
        assert.equal(text(find(next, (node) => node.type === "h1")), nextTitle);
        assert.equal(find(next, (node) => node.props?.name === "email").props.value, "buyer@example.com");
        assert.equal(find(next, (node) => node.props?.role === "alert"), undefined);
        if (code === "customer_not_found") assert.equal(find(next, (node) => node.props?.name === "password").props.value, "");
      }
    });
  }
}

test("verification failure still offers resend instead of signup", async () => {
  const tree = await submit(formHarness(new ApiRequestError("Please verify your email", 403, "email_verification_required")));
  const alert = find(tree, (node) => node.props?.role === "alert");
  assert.equal(text(alert), "Please verify your email before signing in.");
  assert.ok(find(tree, (node) => node.type === "button" && text(node) === "Resend verification email"));
});

test("generic 401 retains a recovery fallback for older backends", async () => {
  const tree = await submit(formHarness(new ApiRequestError("Unauthorized", 401, "unauthorized")));
  assert.ok(text(find(tree, (node) => node.props?.role === "alert")).includes("Check your details"));
});

test("network errors do not claim that an email is unregistered", async () => {
  const tree = await submit(formHarness(new TypeError("Failed to fetch")));
  const alert = find(tree, (node) => node.props?.role === "alert");
  assert.ok(text(alert).includes("temporarily unavailable"));
  assert.equal(find(alert, (node) => ["a", "button"].includes(node.type)), undefined);
});

for (const locale of ["en", "es", "id", "ja", "ko", "zh-CN"]) {
  for (const presentation of ["page", "drawer"]) {
    test(`${locale} ${presentation}: auth headings, fields and password toggle are localized`, () => {
      const harness = formHarness(undefined, presentation, { locale, mode: "register" });
      const expected = (key, fallback) => translations[locale]?.[`account.auth.${key}`] ?? fallback;
      let tree = harness.render();
      assert.equal(text(find(tree, (node) => node.type === "h1")), expected("create_title", "Create your account"));
      assert.ok(text(tree).includes(expected("full_name", "Full name")));
      assert.ok(text(tree).includes(expected("email", "Email address")));
      assert.ok(text(tree).includes(expected("password", "Password")));
      assert.ok(text(tree).includes(expected("password_number", "At least one number")));
      assert.ok(text(tree).includes(expected("password_special", "At least one special character")));
      assert.equal(find(tree, (node) => node.props?.name === "name").props.placeholder, expected("name_placeholder", "Your name"));
      const toggle = find(tree, (node) => node.props?.["aria-label"] === expected("show_password", "Show password"));
      assert.equal(text(toggle), expected("show", "Show"));
      toggle.props.onClick();
      tree = harness.render();
      assert.equal(find(tree, (node) => node.props?.name === "password").props.type, "text");
      assert.equal(text(find(tree, (node) => node.props?.["aria-label"] === expected("hide_password", "Hide password"))), expected("hide", "Hide"));
      const submit = find(tree, (node) => node.type === "button" && node.props.type === "submit");
      assert.equal(text(submit), `${expected("create_account", "Create account")}→`);
      assert.equal(submit.props.disabled, true);
      harness.setLocale("en");
      assert.equal(text(find(harness.render(), (node) => node.type === "h1")), "Create your account");
    });
  }

  test(`${locale}: registration verification and resend retain email interpolation`, async () => {
    const calls = [];
    const harness = formHarness(undefined, "page", { locale, mode: "register", api: {
      register: async (payload) => { calls.push(payload); },
      resendVerificationEmail: async (email) => { calls.push(email); },
    } });
    let tree = harness.render();
    await find(tree, (node) => node.type === "form").props.onSubmit({
      preventDefault() {}, currentTarget: { name: "Ponyo Buyer", email: "buyer@example.com", password: "Safe-pass123!" },
    });
    tree = harness.render();
    const expected = translations[locale]?.["account.auth.verification_sent"] ?? "We’ve sent a verification link to {{ email }}. Please check your inbox to activate your Ponyo account.";
    assert.ok(text(tree).includes(expected.replace("{{ email }}", "buyer@example.com")));
    assert.ok(!text(tree).includes("{{"));
    assert.equal(calls[0].firstName, "Ponyo");
    assert.equal(calls[0].lastName, "Buyer");
    assert.equal(calls[0].marketingOptIn, false);
    const resend = translations[locale]?.["account.auth.resend_verification"] ?? "Resend verification email";
    await find(tree, (node) => node.type === "button" && text(node) === resend).props.onClick();
    assert.equal(calls[1], "buyer@example.com");
    assert.ok(text(harness.render()).includes(translations[locale]?.["account.auth.resend_notice"] ?? "If this email belongs to a pending account, a new verification link has been sent. Check your inbox and spam folder."));
  });

  test(`${locale}: reset copy and instructions remain account-enumeration safe`, async () => {
    const emails = [];
    const harness = formHarness(undefined, "drawer", { locale, mode: "forgot", api: {
      requestPasswordReset: async (email) => { emails.push(email); },
    } });
    let tree = harness.render();
    assert.equal(text(find(tree, (node) => node.type === "h1")), translations[locale]?.["account.auth.reset_title"] ?? "Reset your password");
    assert.ok(text(tree).includes(translations[locale]?.["account.auth.reset_subtitle"] ?? "We’ll send a one-hour reset link if that email belongs to a Ponyo account."));
    assert.equal(find(tree, (node) => node.props?.name === "password"), undefined);
    await find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { email: "buyer@example.com" } });
    tree = harness.render();
    assert.deepEqual(emails, ["buyer@example.com"]);
    assert.ok(text(tree).includes(translations[locale]?.["account.auth.reset_sent"] ?? "If an account matches that email, look for a secure reset link in your inbox. If it doesn’t arrive, contact Ponyo support."));
  });
}

test("registration stays disabled until name, email, and a valid password are entered", () => {
  const harness = formHarness(undefined, "page", { mode: "register" });
  let tree = harness.render();
  const submitButton = () => find(tree, (node) => node.type === "button" && node.props.type === "submit");
  assert.equal(submitButton().props.disabled, true);

  find(tree, (node) => node.props?.name === "name").props.onChange({ target: { value: "   " } });
  find(tree, (node) => node.props?.name === "email").props.onChange({ target: { value: "buyer@example.com" } });
  find(tree, (node) => node.props?.name === "password").props.onChange({ target: { value: "Safe-pass123!" } });
  tree = harness.render();
  assert.equal(submitButton().props.disabled, true);

  find(tree, (node) => node.props?.name === "name").props.onChange({ target: { value: "Ponyo Buyer" } });
  tree = harness.render();
  assert.equal(submitButton().props.disabled, false);

  find(tree, (node) => node.props?.name === "email").props.onChange({ target: { value: "" } });
  tree = harness.render();
  assert.equal(submitButton().props.disabled, true);
});

const frontendErrors = [
  [new ApiNotConfiguredError(), "service_not_connected", "Account service is not connected yet. Please try again later."],
  [new TypeError("Failed to fetch"), "service_unavailable", "The Ponyo service is temporarily unavailable. Please try again in a moment."],
  [new Error("NetworkError"), "service_unavailable", "The Ponyo service is temporarily unavailable. Please try again in a moment."],
  [new ApiRequestError("Backend error", 401, "customer_not_found"), "customer_not_found", "This email is not registered. Please create a Ponyo account."],
  [new ApiRequestError("Backend error", 401, "invalid_password"), "invalid_password", "Incorrect password. Try again or reset your password."],
  [new ApiRequestError("Backend error", 401, "unknown"), "unauthorized", "We couldn't sign you in. Check your details or create a new account if you haven't joined Ponyo yet."],
  [new ApiRequestError("Backend error", 403, "email_verification_required"), "email_verification_required", "Please verify your email before signing in."],
  [new ApiRequestError("Backend error", 409, "conflict"), "email_already_registered", "This email is already registered. Sign in to continue."],
  [null, "request_failed", "Unable to complete this request."],
];

for (const locale of ["en", "es", "id", "ja", "ko", "zh-CN"]) {
  for (const presentation of ["page", "drawer"]) {
    test(`${locale} ${presentation}: frontend auth errors use localized copy and exact English fallbacks`, async () => {
      for (const [error, key, fallback] of frontendErrors) {
        const tree = await submit(formHarness(error, presentation, { locale }));
        const alert = find(tree, (node) => node.props?.role === "alert");
        assert.equal(text(find(alert, (node) => node.props?.className === "api-form-error")), translations[locale]?.[`account.auth.${key}`] ?? fallback, key);
        if (key === "customer_not_found" || key === "unauthorized") {
          assert.ok(text(alert).includes(translations[locale]?.["account.auth.create_ponyo_account"] ?? "Create a Ponyo account"));
        }
        if (key === "invalid_password") {
          assert.ok(text(alert).includes(translations[locale]?.["account.auth.forgot_password"] ?? "Forgot password?"));
        }
      }
      const harness = formHarness(undefined, presentation, { locale, baseUrl: "" });
      const tree = await submit(harness);
      assert.equal(text(find(tree, (node) => node.props?.className === "api-form-error")), translations[locale]?.["account.auth.service_not_connected"] ?? "Account service is not connected yet. Please try again later.");
      assert.deepEqual(harness.requests, []);
    });

    test(`${locale} ${presentation}: unknown backend errors stay verbatim`, async () => {
      for (const error of [new Error("Untranslated backend detail"), new ApiRequestError("Unknown backend failure", 503, "unknown_failure")]) {
        const tree = await submit(formHarness(error, presentation, { locale }));
        assert.equal(text(find(tree, (node) => node.props?.className === "api-form-error")), error.message);
      }
    });

    test(`${locale} ${presentation}: resend localizes only the frontend fallback`, async () => {
      for (const error of [null, new Error("Backend resend detail"), new ApiRequestError("Backend resend failure", 503, "unknown_failure")]) {
        const harness = formHarness(new ApiRequestError("Verify", 403, "email_verification_required"), presentation, { locale, api: {
          resendVerificationEmail: async () => { throw error; },
        } });
        const tree = await submit(harness);
        const resend = translations[locale]?.["account.auth.resend_verification"] ?? "Resend verification email";
        await find(tree, (node) => node.type === "button" && text(node) === resend).props.onClick();
        assert.equal(text(find(harness.render(), (node) => node.props?.className === "api-form-error")), error?.message ?? translations[locale]?.["account.auth.resend_failed"] ?? "Unable to resend the verification email.");
      }
    });
  }
}

for (const locale of ["ja", "ko"]) {
  test(`${locale}: verification delivery failure retains localized pending state and resend`, async () => {
    const harness = formHarness(undefined, "drawer", { locale, mode: "register", api: {
      register: async () => { throw new ApiRequestError("Delivery failed", 503, "verification_email_delivery_failed"); },
    } });
    await find(harness.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { name: "Buyer", email: "buyer@example.com", password: "Safe-pass123!" } });
    const tree = harness.render();
    assert.ok(text(tree).includes(translations[locale]["account.auth.pending_verification"]));
    assert.ok(text(tree).includes(translations[locale]["account.auth.verification_failed"]));
    assert.equal(text(find(tree, (node) => node.props?.role === "alert")), translations[locale]["account.auth.verification_delivery_failed"]);
    assert.ok(find(tree, (node) => node.type === "button" && text(node) === translations[locale]["account.auth.resend_verification"]));
  });
}

test("successful page login replaces the auth route and defaults to homepage while retaining returnTo", () => {
  const component = readFileSync(new URL("../src/components/account/account-auth-form.tsx", import.meta.url), "utf8");
  assert.match(component, /if \(!requested\?\.startsWith\("\/"\)\) return "\/"/);
  assert.match(component, /destination\.origin === window\.location\.origin \? destination\.pathname \+ destination\.search \+ destination\.hash : "\/"/);
  assert.match(component, /else router\.replace\(getPostAuthDestination\(\)\)/);
  assert.match(component, /router\.replace\(getPostAuthDestination\(\)\)/);
});