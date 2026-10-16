import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { request as httpRequest } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import {
  decryptPayoutDetails,
} from "../src/lib/payout-encryption.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const artifactDir = resolve(testDir, "..");
const appBundleDir = resolve(artifactDir, "dist/payout-security-test");
const appBundlePath = resolve(appBundleDir, "app.mjs");
const accountNumber = "1234567890";
const originalFetch = globalThis.fetch;
const originalEnv = new Map([
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYSTACK_SECRET_KEY",
  "PAYOUT_ENCRYPTION_KEY_V2",
  "PAYOUT_ENCRYPTION_CURRENT_VERSION",
].map((key) => [key, process.env[key]]));
const savedDestinations = new Map();
const observedDestinationQueries = [];
let server;
let port;
let fetchCalls = [];
let bankResponse = { status: 200, body: { status: true, data: [{ name: "Test Bank", code: "001" }] } };
let resolveResponse = {
  status: 200,
  body: { status: true, data: { account_name: "Test Account", account_number: accountNumber } },
};
let throwOnPaystack = null;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resetFixtures() {
  savedDestinations.clear();
  observedDestinationQueries.length = 0;
  fetchCalls = [];
  bankResponse = { status: 200, body: { status: true, data: [{ name: "Test Bank", code: "001" }] } };
  resolveResponse = {
    status: 200,
    body: { status: true, data: { account_name: "Test Account", account_number: accountNumber } },
  };
  throwOnPaystack = null;
}

async function mockFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = init.method ?? "GET";
  fetchCalls.push({ url: url.toString(), method });

  if (url.hostname === "api.paystack.co") {
    if (throwOnPaystack === url.pathname) throw new Error("synthetic Paystack outage");
    const fixture = url.pathname === "/bank/resolve" ? resolveResponse : bankResponse;
    return jsonResponse(fixture.body, fixture.status);
  }

  if (url.hostname === "supabase.test" && url.pathname === "/auth/v1/user") {
    const token = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "");
    if (!token || token === "invalid") return jsonResponse({ message: "Unauthorized" }, 401);
    return jsonResponse({ id: token, email: `${token}@example.test` });
  }

  if (url.hostname === "supabase.test" && url.pathname === "/rest/v1/profiles") {
    const userId = url.searchParams.get("id")?.replace(/^eq\./, "");
    return jsonResponse([{ role: userId === "landlord" ? "landlord" : "client" }]);
  }

  if (url.hostname === "supabase.test" && url.pathname === "/rest/v1/landlord_kyc") {
    return jsonResponse([{ indemnity_signed: true }]);
  }

  if (url.hostname === "supabase.test" && url.pathname === "/rest/v1/payout_destinations") {
    if (method === "POST") {
      const body = JSON.parse(init.body);
      savedDestinations.set(body.user_id, body);
      return new Response(null, { status: 204 });
    }
    const userId = url.searchParams.get("user_id")?.replace(/^eq\./, "");
    observedDestinationQueries.push(userId);
    const destination = savedDestinations.get(userId);
    return jsonResponse(destination ? [{ ...destination, verified_at: "2026-10-16T00:00:00.000Z" }] : []);
  }

  throw new Error(`Unexpected mocked request: ${method} ${url}`);
}

async function request(path, { method = "GET", token, body } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await new Promise((resolveRequest, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolveRequest({ status: res.statusCode, body: text ? JSON.parse(text) : null, text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
  return response;
}

async function saveDestination(token = "user-a", bankCode = "001") {
  return request("/api/account/payout-destination", {
    method: "PUT",
    token,
    body: { bankCode, accountNumber },
  });
}

before(async () => {
  process.env["SUPABASE_URL"] = "https://supabase.test";
  process.env["SUPABASE_ANON_KEY"] = "synthetic-anon-key";
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "synthetic-service-role-key";
  process.env["PAYSTACK_SECRET_KEY"] = "sk_test_synthetic";
  process.env["PAYOUT_ENCRYPTION_KEY_V2"] = Buffer.alloc(32, 7).toString("base64url");
  process.env["PAYOUT_ENCRYPTION_CURRENT_VERSION"] = "2";
  globalThis.require = createRequire(import.meta.url);
  await build({
    entryPoints: [resolve(artifactDir, "src/app.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: appBundleDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "silent",
    plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);`,
    },
  });
  const { default: app } = await import(pathToFileURL(appBundlePath).href);
  globalThis.fetch = mockFetch;
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.once("listening", resolveListen);
  });
  port = server.address().port;
});

after(async () => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  await rm(appBundleDir, { recursive: true, force: true });
});

test("bank list uses mocked Paystack data and filters invalid entries", async () => {
  resetFixtures();
  bankResponse = {
    status: 200,
    body: { status: true, data: [{ name: "Test Bank", code: "001" }, { name: "", code: "bad" }, { code: "002" }] },
  };
  const response = await request("/api/account/payout-banks", { token: "user-a" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [{ name: "Test Bank", code: "001" }]);
  assert.equal(fetchCalls.filter(({ url }) => url.includes("api.paystack.co/bank?")).length, 1);
});

test("payout endpoints require authenticated access", async () => {
  resetFixtures();
  const banks = await request("/api/account/payout-banks");
  const destination = await request("/api/account/payout-destination");
  const save = await request("/api/account/payout-destination", {
    method: "PUT",
    body: { bankCode: "001", accountNumber },
  });
  assert.equal(banks.status, 401);
  assert.equal(destination.status, 401);
  assert.equal(save.status, 401);
  assert.equal(fetchCalls.filter(({ url }) => url.includes("api.paystack.co")).length, 0);
  assert.equal(savedDestinations.size, 0);
});

test("verified destination persists ciphertext only and returns a masked account number", async () => {
  resetFixtures();
  const response = await saveDestination();
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    configured: true,
    bankName: "Test Bank",
    accountName: "Test Account",
    accountLast4: "7890",
  });
  assert.equal(response.text.includes(accountNumber), false);

  const stored = savedDestinations.get("user-a");
  assert.ok(stored);
  assert.equal(stored.user_id, "user-a");
  assert.equal(stored.encryption_version, 2);
  assert.equal(stored.encrypted_payload.includes(accountNumber), false);
  assert.equal(JSON.stringify(stored).includes(accountNumber), false);
  assert.deepEqual(
    JSON.parse(decryptPayoutDetails(
      stored.encrypted_payload,
      stored.iv,
      stored.auth_tag,
      stored.encryption_version,
    )),
    {
      accountNumber,
      accountName: "Test Account",
      bankName: "Test Bank",
      bankCode: "001",
    },
  );
});

test("saved destinations are scoped to the authenticated user and reads stay masked", async () => {
  resetFixtures();
  assert.equal((await saveDestination("user-a")).status, 200);
  const otherUser = await request("/api/account/payout-destination", { token: "user-b" });
  assert.deepEqual(otherUser.body, { configured: false });
  const owner = await request("/api/account/payout-destination", { token: "user-a" });
  assert.deepEqual(owner.body, {
    configured: true,
    bankName: "Test Bank",
    accountName: "Test Account",
    accountLast4: "7890",
  });
  assert.equal(owner.text.includes(accountNumber), false);
  assert.deepEqual(observedDestinationQueries, ["user-b", "user-a"]);
});

test("unsupported banks do not trigger resolution or save a destination", async () => {
  resetFixtures();
  const response = await saveDestination("user-a", "unsupported");
  assert.equal(response.status, 422);
  assert.equal(fetchCalls.filter(({ url }) => url.includes("/bank/resolve")).length, 0);
  assert.equal(savedDestinations.size, 0);
});

test("invalid account numbers returned by Paystack are never saved", async () => {
  resetFixtures();
  resolveResponse = { status: 400, body: { status: false, message: "Account could not be resolved" } };
  const response = await saveDestination();
  assert.equal(response.status, 422);
  assert.equal(savedDestinations.size, 0);
});

test("a resolved account number mismatch is never saved", async () => {
  resetFixtures();
  resolveResponse = {
    status: 200,
    body: { status: true, data: { account_name: "Wrong Account", account_number: "9999999999" } },
  };
  const response = await saveDestination();
  assert.equal(response.status, 422);
  assert.equal(savedDestinations.size, 0);
});

test("Paystack upstream HTTP and connection failures never save a destination", async (t) => {
  for (const failure of [
    { name: "bank-list HTTP failure", configure: () => { bankResponse = { status: 503, body: { status: false } }; } },
    { name: "account-resolution HTTP failure", configure: () => { resolveResponse = { status: 503, body: { status: false } }; } },
    { name: "bank-list connection failure", configure: () => { throwOnPaystack = "/bank"; } },
    { name: "account-resolution connection failure", configure: () => { throwOnPaystack = "/bank/resolve"; } },
  ]) {
    await t.test(failure.name, async () => {
      resetFixtures();
      failure.configure();
      const response = await saveDestination();
      assert.equal(response.status, 502);
      assert.equal(savedDestinations.size, 0);
    });
  }
});

test("the browser code does not write account numbers to local or session storage", async () => {
  const appSource = await readFile(resolve(artifactDir, "../estatehold/src/App.tsx"), "utf8");
  const storageWrites = [...appSource.matchAll(/(?:localStorage|sessionStorage)\.setItem\(([^;\n]*)/g)];
  assert.ok(storageWrites.length > 0);
  assert.ok(storageWrites.every(([, args]) => !args.includes("accountNumber")));
  assert.doesNotMatch(appSource, /(?:localStorage|sessionStorage)\.(?:setItem|getItem)\([^;\n]*accountNumber/);
});
