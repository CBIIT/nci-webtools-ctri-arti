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

  await t.test("/_/users/:id edit page loads test user", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      const el = await waitForElement(container, "h1", (el) =>
        el.textContent.includes(testUser.email)
      );
      assert.ok(el, "Edit page should show test user email");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id/usage shows user usage", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
    try {
      const el = await waitForElement(container, "*", (el) =>
        el.textContent.includes(testUser.email)
      );
      assert.ok(el, "User usage page should show test user email");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  // ── Action tests — verify user interactions work ─────────────────────────

  await t.test("/_/profile: update firstName/lastName", async () => {
    const { container, errors, dispose } = mountApp("/_/profile");
    try {
      // Wait for form with firstName input (inside Show when=!session.loading)
      const firstName = await waitForElement(container, "#firstName");
      const lastName = container.querySelector("#lastName");
      assert.ok(firstName, "firstName input should exist");
      assert.ok(lastName, "lastName input should exist");

      // Fill inputs and trigger SolidJS reactivity
      firstName.value = "SmokeFirst";
      firstName.dispatchEvent(new Event("input", { bubbles: true }));
      lastName.value = "SmokeLast";
      lastName.dispatchEvent(new Event("input", { bubbles: true }));

      // Submit form
      const form = firstName.closest("form");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

      // Wait for success alert
      const alert = await waitForElement(container, ".alert-success", 5000);
      assert.ok(alert, "Success alert should appear after profile save");
      assert.ok(alert.textContent.includes("Success"), "Alert should contain success text");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id: edit and save user", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      // Wait for firstName input (inside Show when=!roles.loading && !userData.loading)
      const firstName = await waitForElement(container, "#firstName");
      assert.ok(firstName, "firstName input should exist");

      // Change firstName and trigger reactivity
      firstName.value = "EditedSmoke";
      firstName.dispatchEvent(new Event("input", { bubbles: true }));

      // Submit form
      const form = firstName.closest("form");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

      // Wait for navigation back to users list (success indicator)
      // The edit page navigates to /_/users on success, so we wait for that heading
      const heading = await waitForElement(
        container,
        "h1",
        (el) => el.textContent.includes("Manage Users"),
        5000
      );
      assert.ok(heading, "Should navigate to users list after save");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users: search and status filter", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      // Wait for table to render with test user
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      // Test search filter
      const searchInput = container.querySelector("#search-filter");
      assert.ok(searchInput, "Search input should exist");
      searchInput.value = testUser.email.substring(0, 5);
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      // Brief wait for reactivity
      await new Promise((r) => setTimeout(r, 200));
      assert.strictEqual(errors.length, 0, `Errors after search: ${errors.map((e) => e.message)}`);

      // Test status filter
      const statusFilter = container.querySelector("#status-filter");
      assert.ok(statusFilter, "Status filter should exist");
      statusFilter.value = "inactive";
      statusFilter.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      assert.strictEqual(
        errors.length,
        0,
        `Errors after status change: ${errors.map((e) => e.message)}`
      );

      // Reset status back to active
      statusFilter.value = "active";
      statusFilter.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      assert.strictEqual(
        errors.length,
        0,
        `Errors after status reset: ${errors.map((e) => e.message)}`
      );
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage: date range filter", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      // Wait for page to render with table data
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      const dateRange = container.querySelector("#date-range-filter");
      assert.ok(dateRange, "Date range filter should exist");

      // Switch to Last 30 Days via selectedIndex (SolidJS onInput delegation)
      dateRange.selectedIndex = 1; // "Last 30 Days"
      dateRange.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      assert.strictEqual(
        errors.length,
        0,
        `Errors after date range change: ${errors.map((e) => e.message)}`
      );

      // Switch to Custom
      dateRange.selectedIndex = 5; // "Custom"
      dateRange.dispatchEvent(new InputEvent("input", { bubbles: true }));

      // Wait for custom date inputs to appear (inside Show conditional)
      const startDate = await waitForElement(container, "#custom-startDate", 5000);
      const endDate = container.querySelector("#custom-endDate");
      assert.ok(startDate, "Custom start date input should appear");
      assert.ok(endDate, "Custom end date input should appear");
      assert.strictEqual(
        errors.length,
        0,
        `Errors after custom date switch: ${errors.map((e) => e.message)}`
      );
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});
