/**
 * API smoke tests — exercise key endpoints against the real server.
 * Runs in-browser during integration tests via ?test=1&apiKey=...
 */
import assert from "/test/assert.js";
import { mountApp, waitForCondition, waitForElement, waitForNetworkIdle } from "/test/helpers.js";
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

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

  // ── POST /session ──────────────────────────────────────────────────────────
  await t.test("POST /session refreshes session", async () => {
    const { status, json } = await api("POST", "/session");
    assert.strictEqual(status, 200);
    assert.ok(json.user, "should return user");
    assert.ok(json.expires, "should return expires");
    assertISODate(json.expires, "expires");
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

  // ── GET /admin/users with filters ─────────────────────────────────────
  await t.test("GET /admin/users with search filter", async () => {
    const { status, json } = await api(
      "GET",
      `/admin/users?search=${encodeURIComponent(testUser.email.substring(0, 5))}&limit=10&offset=0`
    );
    assert.strictEqual(status, 200);
    assert.ok(json.data, "response should have data");
    assert.ok(Array.isArray(json.data), "data should be an array");
    assert.ok(json.meta, "response should have meta");
    assert.ok(json.meta.total !== undefined, "meta should have total");
  });

  await t.test("GET /admin/users with status filter", async () => {
    const { status, json } = await api("GET", "/admin/users?status=active&limit=10&offset=0");
    assert.strictEqual(status, 200);
    assert.ok(json.data, "response should have data");
    assert.ok(json.data.length > 0, "should have at least one active user");
  });

  await t.test("GET /admin/users with pagination", async () => {
    const { status, json } = await api("GET", "/admin/users?limit=1&offset=0");
    assert.strictEqual(status, 200);
    assert.ok(json.data, "response should have data");
    assert.ok(json.data.length <= 1, "should respect limit=1");
    assert.ok(json.meta.total >= 1, "total count should be at least 1");
  });

  // ── GET /admin/analytics ───────────────────────────────────────────────
  await t.test("GET /admin/analytics groupBy=user", async () => {
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { status, json } = await api(
      "GET",
      `/admin/analytics?groupBy=user&startDate=${weekAgo}&endDate=${today}`
    );
    assert.strictEqual(status, 200);
    assert.ok(json.data, "analytics should have data");
    assert.ok(Array.isArray(json.data), "analytics data should be an array");
  });

  await t.test("GET /admin/analytics groupBy=model", async () => {
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { status, json } = await api(
      "GET",
      `/admin/analytics?groupBy=model&startDate=${weekAgo}&endDate=${today}`
    );
    assert.strictEqual(status, 200);
    assert.ok(json.data, "analytics should have data");
    assert.ok(Array.isArray(json.data), "analytics data should be an array");
  });

  await t.test("GET /admin/analytics groupBy=day", async () => {
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { status, json } = await api(
      "GET",
      `/admin/analytics?groupBy=day&startDate=${weekAgo}&endDate=${today}`
    );
    assert.strictEqual(status, 200);
    assert.ok(json.data, "analytics should have data");
    assert.ok(Array.isArray(json.data), "analytics data should be an array");
  });

  // ── POST /admin/profile ────────────────────────────────────────────────
  await t.test("POST /admin/profile updates user profile", async () => {
    const { status, json } = await api("POST", "/admin/profile", {
      firstName: "SmokeAPI",
      lastName: "TestAPI",
    });
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
    assert.ok(json.id || json.email, "response should contain user data");
  });

  // ── GET /model/list ────────────────────────────────────────────────────
  await t.test("GET /model/list returns models array", async () => {
    const { status, json } = await api("GET", "/model/list");
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(json), "model list should be an array");
    assert.ok(json.length > 0, "should have at least one model");
  });

  // ── POST /model streaming ─────────────────────────────────────────────
  await t.test("POST /model with mock-model stream=true returns streaming response", async () => {
    const res = await fetch("/api/v1/model", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: [{ text: "stream test" }] }],
        stream: true,
      }),
    });
    assert.ok(res.ok, `streaming request failed: ${res.status}`);
    // Streaming responses have text/event-stream or similar content type
    const text = await res.text();
    assert.ok(text.length > 0, "streaming response should have content");
  });

  await t.test("POST /model stream=true is recorded in GET /admin/usage", async () => {
    const today = formatLocalDate(new Date());
    const monthAgo = formatLocalDate(new Date(Date.now() - 30 * 86400000));
    const usageType = `e2e-usage-repro-${Date.now()}`;

    const before = await api(
      "GET",
      `/admin/usage?userId=${testUser.id}&type=${encodeURIComponent(usageType)}&startDate=${monthAgo}&endDate=${today}&limit=20`
    );
    assert.strictEqual(before.status, 200);
    const beforeCount = before.json?.meta?.total ?? before.json?.data?.length ?? 0;

    const res = await fetch("/api/v1/model", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: "mock-model",
        messages: [{ role: "user", content: [{ text: "usage repro stream test" }] }],
        stream: true,
        type: usageType,
      }),
    });
    assert.ok(res.ok, `streaming request failed: ${res.status}`);
    const streamText = await res.text();
    assert.ok(streamText.length > 0, "streaming response should have content");

    let after;
    for (let attempt = 0; attempt < 5; attempt++) {
      after = await api(
        "GET",
        `/admin/usage?userId=${testUser.id}&type=${encodeURIComponent(usageType)}&startDate=${monthAgo}&endDate=${today}&limit=20`
      );
      assert.strictEqual(after.status, 200);
      const afterCount = after.json?.meta?.total ?? after.json?.data?.length ?? 0;
      if (afterCount > beforeCount) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const afterCount = after.json?.meta?.total ?? after.json?.data?.length ?? 0;
    assert.ok(
      afterCount > beforeCount,
      `expected usage count to increase for type ${usageType}; before=${beforeCount}, after=${afterCount}`
    );

    const entry = (after.json?.data || []).find((row) => row.type === usageType);
    assert.ok(entry, "expected recorded usage entry");
    assert.strictEqual(entry.userID, testUser.id, "usage entry should belong to the test user");
    assert.strictEqual(entry.modelName, "Mock Model", "usage entry should resolve model name");
    assert.ok(entry.requestId, "usage entry should include a request id");
    assert.ok(entry.quantity > 0, "usage entry should include usage quantity");
    assert.strictEqual(typeof entry.unit, "string", "usage entry should include a usage unit");
    assert.strictEqual(typeof entry.cost, "number", "usage entry should include a numeric cost");
    assertISODate(entry.createdAt, "usage createdAt");
  });

  // ── Error handling ─────────────────────────────────────────────────────
  await t.test("GET /admin/users/99999 returns 404 for non-existent user", async () => {
    const res = await fetch("/api/v1/admin/users/99999", {
      method: "GET",
      headers: headers(),
    });
    assert.ok(res.status === 404 || res.status === 400, `expected 404 or 400, got ${res.status}`);
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
      const heading = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Edit User")
      );
      const email = await waitForElement(container, ".profile-card-email", (el) =>
        el.textContent.includes(testUser.email)
      );
      assert.ok(heading, "Edit page should show the edit heading");
      assert.ok(email, "Edit page should show test user email");
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

      await waitForNetworkIdle();
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
      await waitForNetworkIdle();
      assert.strictEqual(errors.length, 0, `Errors after search: ${errors.map((e) => e.message)}`);

      // Test status filter
      const statusFilter = container.querySelector("#status-filter");
      assert.ok(statusFilter, "Status filter should exist");
      statusFilter.value = "inactive";
      statusFilter.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForNetworkIdle();
      assert.strictEqual(
        errors.length,
        0,
        `Errors after status change: ${errors.map((e) => e.message)}`
      );

      // Reset status back to active
      statusFilter.value = "active";
      statusFilter.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForNetworkIdle();
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
      await waitForNetworkIdle();
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

  // ── Inactivity dialog E2E ──────────────────────────────────────────────
  await t.test("Inactivity dialog: warning appears and Extend Session works", async () => {
    const { container, errors, dispose } = mountApp("/");
    const originalFetch = window.fetch;
    try {
      // Wait for page + auth to load
      await waitForElement(container, "h1", (el) => el.textContent.includes("Research Optimizer"));
      await waitForCondition(
        () => window.__authContext?.().status() === "LOADED" && !!window.__authContext?.().expires(),
        5000,
        "inactivity auth loaded"
      );

      const authCtx = window.__authContext?.();
      assert.ok(authCtx, "Auth context should be exposed on window.__authContext");
      assert.ok(authCtx.updateExpires, "Auth context should have updateExpires");
      assert.ok(authCtx.expires(), "Auth context should have an expires value");

      // Set expires to 10 seconds from now — under the warning threshold
      authCtx.updateExpires(new Date(Date.now() + 10 * 1000).toISOString());

      // Wait for the warning modal to appear
      const warningModal = await waitForElement(container, ".inactivity-warning-modal", 10000);
      assert.ok(warningModal, "Warning modal should appear when session is about to expire");

      // Verify countdown text is shown
      const warningText = container.querySelector(".inactivity-warning-text");
      assert.ok(warningText, "Warning text should be present");
      assert.ok(
        warningText.textContent.includes("about to expire"),
        "Warning should mention expiration"
      );

      // Intercept POST /session to return a far-future expiry
      const farFutureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      window.fetch = function (url, opts) {
        if (typeof url === "string" && url.includes("/api/v1/session") && opts?.method === "POST") {
          return Promise.resolve(
            new Response(JSON.stringify({ user: authCtx.user(), expires: farFutureExpiry }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return originalFetch.apply(this, arguments);
      };

      // Click "EXTEND SESSION"
      const extendBtn = container.querySelector(".extend-button");
      assert.ok(extendBtn, "Extend Session button should be present");
      extendBtn.click();

      // Wait for warning modal to disappear
      await new Promise((resolve, reject) => {
        const start = Date.now();
        (function check() {
          const modal = container.querySelector(".inactivity-warning-modal");
          if (!modal) return resolve();
          if (Date.now() - start > 5000)
            return reject(new Error("Warning modal did not close after Extend Session"));
          requestAnimationFrame(check);
        })();
      });

      assert.ok(
        !container.querySelector(".inactivity-warning-modal"),
        "Warning modal should be gone after extending session"
      );

      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      window.fetch = originalFetch;
      dispose();
      document.body.removeChild(container);
    }
  });
});
