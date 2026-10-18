import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { request as httpRequest } from "node:http";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";

const testDir = dirname(fileURLToPath(import.meta.url));
const artifactDir = resolve(testDir, "..");
const appBundleDir = resolve(artifactDir, "dist/executive-access-test");
const appBundlePath = resolve(appBundleDir, "app.mjs");
const originalFetch = globalThis.fetch;
const originalEnv = new Map([
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
].map((key) => [key, process.env[key]]));
const profiles = new Map([
  ["owner", { id: "owner", email: "owner@example.test", role: "owner" }],
  ["admin", { id: "admin", email: "admin@example.test", role: "admin" }],
  ["executive", { id: "executive", email: "executive@example.test", role: "executive", is_executive: true }],
  ["client", { id: "client", email: "client@example.test", role: "client" }],
  ["target-client", { id: "target-client", email: "target@example.test", role: "client" }],
  ["target-owner", { id: "target-owner", email: "target-owner@example.test", role: "owner" }],
  ["target-admin", { id: "target-admin", email: "target-admin@example.test", role: "admin" }],
]);
const executiveRoleIds = new Set();
const rpcCalls = [];
let server;
let port;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resetFixtures() {
  executiveRoleIds.clear();
  rpcCalls.length = 0;
  profiles.get("target-client").role = "client";
  profiles.get("target-client").is_executive = false;
}

async function mockFetch(input, init = {}) {
  const url = new URL(String(input));
  const method = init.method ?? "GET";

  if (url.hostname !== "supabase.test") throw new Error(`Unexpected request: ${method} ${url}`);

  if (url.pathname === "/auth/v1/user") {
    const token = new Headers(init.headers).get("Authorization")?.replace(/^Bearer /, "");
    const user = profiles.get(token);
    return user ? jsonResponse({ id: user.id, email: user.email }) : jsonResponse({ message: "Unauthorized" }, 401);
  }

  if (url.pathname === "/rest/v1/profiles") {
    const emailFilter = url.searchParams.get("email");
    if (emailFilter) {
      const email = emailFilter.replace(/^ilike\./, "").toLowerCase();
      const matches = [...profiles.values()].filter((profile) => profile.email.toLowerCase() === email);
      return jsonResponse(matches.map(({ id, email: profileEmail, role }) => ({ id, email: profileEmail, role })));
    }

    const userId = url.searchParams.get("id")?.replace(/^eq\./, "");
    const profile = profiles.get(userId);
    if (!profile) return jsonResponse([]);
    return jsonResponse([{
      role: profile.role,
      is_admin: profile.role === "admin",
      is_executive: profile.is_executive === true || executiveRoleIds.has(profile.id) || profile.role === "executive",
    }]);
  }

  if (url.pathname === "/rest/v1/rpc/change_executive_access" && method === "POST") {
    const args = JSON.parse(init.body);
    rpcCalls.push(args);
    const actor = profiles.get(args.p_actor_profile_id);
    const target = profiles.get(args.p_target_profile_id);
    if (actor?.role !== "owner" || !target) return jsonResponse({ message: "Access change rejected" }, 400);
    if (target.role === "admin") return jsonResponse({ message: "Administrator roles cannot be changed" }, 400);

    if (target.role === "owner") {
      if (args.p_grant_access) executiveRoleIds.add(target.id);
      else executiveRoleIds.delete(target.id);
      return jsonResponse([{
        profile_id: target.id,
        previous_role: executiveRoleIds.has(target.id) ? "owner" : "executive",
        new_role: args.p_grant_access ? "executive" : "owner",
        changed: true,
      }]);
    }

    const previousRole = target.role;
    if (args.p_grant_access) {
      target.role = "executive";
      target.is_executive = true;
    } else {
      target.role = "client";
      target.is_executive = false;
    }
    return jsonResponse([{
      profile_id: target.id,
      previous_role: previousRole,
      new_role: target.role,
      changed: previousRole !== target.role,
    }]);
  }

  if (url.pathname.startsWith("/rest/v1/")) return jsonResponse([]);
  throw new Error(`Unexpected request: ${method} ${url}`);
}

async function request(path, { method = "GET", token, body, headers = {} } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolveRequest, reject) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolveRequest({ status: res.statusCode, body: text ? JSON.parse(text) : null });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const assignment = (email) => ({ email, role: "executive" });

before(async () => {
  process.env["SUPABASE_URL"] = "https://supabase.test";
  process.env["SUPABASE_ANON_KEY"] = "synthetic-anon-key";
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = "synthetic-service-role-key";
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

test("role assignment requires authentication and an owner profile", async () => {
  resetFixtures();
  for (const method of ["POST", "DELETE"]) {
    const anonymous = await request("/api/admin/set-role", { method, body: assignment("target@example.test") });
    const client = await request("/api/admin/set-role", {
      method,
      token: "client",
      body: assignment("target@example.test"),
      headers: { "X-Estatehold-Mock-Owner-Preview": "true" },
    });
    assert.equal(anonymous.status, 401, `${method} must reject anonymous role changes`);
    assert.equal(client.status, 403, `${method} must reject non-owner role changes`);
  }
  assert.equal(rpcCalls.length, 0);
});

test("owner can assign executive access to the uniquely matching profile", async () => {
  resetFixtures();
  const response = await request("/api/admin/set-role", {
    method: "POST",
    token: "owner",
    body: assignment("TARGET@EXAMPLE.TEST"),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { profileId: "target-client", role: "executive" });
  assert.equal(profiles.get("target-client").role, "executive");
  assert.deepEqual(rpcCalls.map(({ p_actor_profile_id, p_target_profile_id, p_grant_access }) => ({
    actor: p_actor_profile_id,
    target: p_target_profile_id,
    grant: p_grant_access,
  })), [{ actor: "owner", target: "target-client", grant: true }]);
});

test("owner executive assignment preserves owner role and cannot alter admin role", async () => {
  resetFixtures();
  const ownerResponse = await request("/api/admin/set-role", {
    method: "POST",
    token: "owner",
    body: assignment("target-owner@example.test"),
  });
  assert.equal(ownerResponse.status, 200);
  assert.equal(profiles.get("target-owner").role, "owner");
  assert.equal(executiveRoleIds.has("target-owner"), true);

  const adminResponse = await request("/api/admin/set-role", {
    method: "POST",
    token: "owner",
    body: assignment("target-admin@example.test"),
  });
  assert.equal(adminResponse.status, 409);
  assert.equal(profiles.get("target-admin").role, "admin");
  assert.equal(rpcCalls.length, 1);
});

test("revoking assigned executive access does not demote an owner profile", async () => {
  resetFixtures();
  executiveRoleIds.add("target-owner");
  const response = await request("/api/admin/set-role", {
    method: "DELETE",
    token: "owner",
    body: assignment("target-owner@example.test"),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    profileId: "target-owner",
    executiveAccess: false,
    effectiveRole: "owner",
  });
  assert.equal(profiles.get("target-owner").role, "owner");
  assert.equal(executiveRoleIds.has("target-owner"), false);
});

test("role assignment rejects missing or ambiguous profile matches without changing roles", async () => {
  resetFixtures();
  const missing = await request("/api/admin/set-role", {
    method: "POST",
    token: "owner",
    body: assignment("missing@example.test"),
  });
  profiles.set("duplicate-target", {
    id: "duplicate-target",
    email: "target@example.test",
    role: "client",
  });
  const ambiguous = await request("/api/admin/set-role", {
    method: "POST",
    token: "owner",
    body: assignment("target@example.test"),
  });
  assert.equal(missing.status, 404);
  assert.equal(ambiguous.status, 409);
  assert.equal(rpcCalls.length, 0);
  assert.equal(profiles.get("target-client").role, "client");
});

test("admin API dashboard access follows the server profile role, not the local preview flag", async () => {
  resetFixtures();
  const anonymous = await request("/api/admin/dashboard", {
    headers: { "X-Estatehold-Mock-Owner-Preview": "true" },
  });
  const client = await request("/api/admin/dashboard", {
    token: "client",
    headers: { "X-Estatehold-Mock-Owner-Preview": "true" },
  });
  const owner = await request("/api/admin/dashboard", { token: "owner" });
  const admin = await request("/api/admin/dashboard", { token: "admin" });
  const executive = await request("/api/admin/dashboard", { token: "executive" });
  assert.equal(anonymous.status, 401);
  assert.equal(client.status, 403);
  assert.equal(owner.status, 403);
  assert.equal(admin.status, 200);
  assert.equal(executive.status, 200);
});
