import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/ponyo-api.client.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function client(env, browser = false) {
  const requests = [];
  const context = {
    exports: {},
    process: { env },
    Headers,
    URLSearchParams,
    ...(browser ? { window: {}, document: { cookie: "" } } : {}),
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ data: { csrfToken: "test-token" } }) };
    },
  };
  vm.runInNewContext(outputText, context);
  return { api: context.exports.ponyoApi, requests };
}

test("SSR resolves development proxy to absolute backend URL", async () => {
  const { api, requests } = client({ NODE_ENV: "development", NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" });
  await api.listProducts("", "ja");
  assert.equal(requests[0], "http://127.0.0.1:8000/v1/products?locale=ja");
});

test("SSR respects a private backend override", async () => {
  const { api, requests } = client({ NODE_ENV: "production", NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api", PONYO_API_SERVER_BASE_URL: "https://api.example.test/" });
  await api.listProducts();
  assert.equal(requests[0], "https://api.example.test/v1/products?locale=en");
});

test("browser retains same-origin proxy for CSRF and registration", async () => {
  const { api, requests } = client({ NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" }, true);
  await api.register({ email: "test@example.test", password: "test" });
  assert.deepEqual(requests, ["/ponyo-api/v1/auth/csrf", "/ponyo-api/v1/auth/register"]);
});

test("absolute public URL remains unchanged on server", async () => {
  const { api, requests } = client({ NEXT_PUBLIC_PONYO_API_BASE_URL: "https://api.example.test/" });
  await api.listProducts();
  assert.equal(requests[0], "https://api.example.test/v1/products?locale=en");
});

test("production relative URL requires explicit server configuration", async () => {
  const { api, requests } = client({ NODE_ENV: "production", NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" });
  await assert.rejects(api.listProducts(), /PONYO_API_SERVER_BASE_URL/);
  assert.equal(requests.length, 0);
});