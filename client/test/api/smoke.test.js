/**
 * API smoke tests — exercise key endpoints against the real server.
 * Runs in-browser during integration tests via ?test=1&apiKey=...
 */
import assert from "/test/assert.js";
import { mountApp, waitForElement } from "/test/helpers.js";
import test from "/test/test.js";

const urlParams = new URLSearchParams(window.location.search);
const TEST_API_KEY = urlParams.get("apiKey");

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (TEST_API_KEY) h["x-api-key"] = TEST_API_KEY;
  return h;
}

async function api(method, path, body) {
  const opts = { method, headers: headers() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/v1${path}`, opts);
  const json = await res.json();
  return { status: res.status, json };
}

function assertISODate(value, label) {
  assert.strictEqual(typeof value, "string", `${label} should be a string`);
  assert.ok(!isNaN(Date.parse(value)), `${label} should be a valid ISO date`);
}

let testUser;

test("API Smoke Tests", async (t) => {
  // ── GET /session ──────────────────────────────────────────────────────────
  await t.test("GET /session returns user", async () => {
    const { status, json } = await api("GET", "/session");
    assert.strictEqual(status, 200);
    assert.ok(json.user, "session should contain user");
    assert.ok(json.user.id, "user should have id");
    assert.ok(json.user.email, "user should have email");
    testUser = json.user;
  });

  // ── POST /admin/users (update with timestamps + Role) ────────────────────
  await t.test("POST /admin/users survives timestamps + nested Role", async () => {
    // Send full object including timestamps and nested Role — the exact
    // payload shape that caused the toISOString crash pre-fix.
    const payload = { ...testUser };
    const { status, json } = await api("POST", "/admin/users", payload);
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
    assert.ok(json.id, "response should have id");
    if (json.createdAt) assertISODate(json.createdAt, "createdAt");
    if (json.updatedAt) assertISODate(json.updatedAt, "updatedAt");
  });

  // ── GET /admin/roles ──────────────────────────────────────────────────────
  await t.test("GET /admin/roles returns array", async () => {
    const { status, json } = await api("GET", "/admin/roles");
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(json), "roles should be an array");
    assert.ok(json.length > 0, "should have at least one role");
    assert.ok(json[0].name, "role should have a name");
  });

  // ── Conversation CRUD round-trip ──────────────────────────────────────────
  await t.test("POST + GET + DELETE /conversations round-trip", async () => {
    const createRes = await api("POST", "/conversations", { title: "__smoke_test__" });
    assert.strictEqual(createRes.status, 201, `create: expected 201, got ${createRes.status}`);
    const convo = createRes.json;
    assert.ok(convo.id, "created conversation should have id");
    assert.strictEqual(convo.title, "__smoke_test__");
    if (convo.createdAt) assertISODate(convo.createdAt, "conversation createdAt");

    const getRes = await api("GET", `/conversations/${convo.id}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.json.id, convo.id);

    const delRes = await api("DELETE", `/conversations/${convo.id}`);
    assert.strictEqual(delRes.status, 200);
  });

  // ── POST /model with mock-model to generate usage ─────────────────────
  await t.test("POST /model with mock-model generates usage", async () => {
    const res = await fetch("/api/v1/model", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: [{ text: "smoke test" }] }],
        stream: false,
      }),
    });
    assert.ok(res.ok, `mock model request failed: ${res.status}`);
    const json = await res.json();
    assert.ok(json.output, "response should have output");
    assert.ok(json.usage, "response should have usage");
  });

  // ── Page smoke tests — verify real data renders ────────────────────────
  await t.test("/_/users shows test user in table", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      const cell = await waitForElement(container, "td", (el) =>
        el.textContent.includes(testUser.email)
      );
      assert.ok(cell, "Test user email should appear in users table");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage shows usage data for test user", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      const cell = await waitForElement(container, "td", (el) =>
        el.textContent.includes(testUser.email)
      );
      assert.ok(cell, "Test user email should appear in usage table");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/profile shows test user email", async () => {
    const { container, errors, dispose } = mountApp("/_/profile");
    try {
      const el = await waitForElement(container, "h1", (el) =>
        el.textContent.includes(testUser.email)
      );
      assert.ok(el, "Profile page should show test user email");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});
