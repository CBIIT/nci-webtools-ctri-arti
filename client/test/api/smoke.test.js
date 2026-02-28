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

test("API Smoke Tests", async (t) => {
  // ── GET /session ──────────────────────────────────────────────────────────
  await t.test("GET /session returns user", async () => {
    const { status, json } = await api("GET", "/session");
    assert.strictEqual(status, 200);
    assert.ok(json.user, "session should contain user");
    assert.ok(json.user.id, "user should have id");
    assert.ok(json.user.email, "user should have email");
  });

  // ── POST /admin/users (update with timestamps + Role) ────────────────────
  await t.test("POST /admin/users survives timestamps + nested Role", async () => {
    // Fetch our own user first
    const session = await api("GET", "/session");
    const user = session.json.user;

    // Send full object including timestamps and nested Role — this is the
    // exact payload shape that caused the toISOString crash pre-fix.
    const payload = {
      ...user,
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    const { status, json } = await api("POST", "/admin/users", payload);
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
    assert.ok(json.id, "response should have id");

    // Verify date fields in response are valid ISO strings
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
    // Create
    const createRes = await api("POST", "/conversations", { title: "__smoke_test__" });
    assert.strictEqual(createRes.status, 200, `create: expected 200, got ${createRes.status}`);
    const convo = createRes.json;
    assert.ok(convo.id, "created conversation should have id");
    assert.strictEqual(convo.title, "__smoke_test__");
    if (convo.createdAt) assertISODate(convo.createdAt, "conversation createdAt");

    // Read
    const getRes = await api("GET", `/conversations/${convo.id}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.json.id, convo.id);

    // Delete
    const delRes = await api("DELETE", `/conversations/${convo.id}`);
    assert.strictEqual(delRes.status, 200);
  });

  // ── Page smoke tests — mount app and visit authenticated pages ─────────
  await t.test("/_/profile renders without errors", async () => {
    const { container, dispose } = mountApp("/_/profile");
    try {
      const heading = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Profile")
      );
      assert.ok(heading, "Should render Profile heading");
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/ home page renders without errors", async () => {
    const { container, dispose } = mountApp("/");
    try {
      const el = await waitForElement(container, "[class]", 5000);
      assert.ok(el, "Home page should render content");
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});
