import {
  formatDate,
  formatDateInputForDisplay,
  formatUtcTimestampToLocal,
  normalizeUtcTimestamp,
} from "../../../pages/users/date-utils.js";
import assert from "../../assert.js";
import { mountApp, waitForElement } from "../../helpers.js";
import test from "../../test.js";

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

let testUser;

test("Usage date utilities", async (t) => {
  await t.test("formatDate keeps local calendar date", () => {
    const value = formatDate(new Date(2026, 2, 9, 23, 30, 0, 0));
    assert.strictEqual(value, "2026-03-09");
  });

  await t.test("date-only display does not shift to previous local day", () => {
    assert.strictEqual(formatDateInputForDisplay("2026-03-09", "en-US"), "3/9/2026");
  });

  await t.test("UTC timestamps render in local time", () => {
    const rendered = formatUtcTimestampToLocal("2026-03-09T12:30:00Z", "en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    assert.strictEqual(rendered, "3/9/2026, 8:30 AM");
  });

  await t.test("timestamps missing timezone are treated as UTC", () => {
    const parsed = normalizeUtcTimestamp("2026-03-09T12:30:00");
    assert.strictEqual(parsed.toISOString(), "2026-03-09T12:30:00.000Z");
  });
});

test("Usage Dashboard Tests", async (t) => {
  // Fetch session to get test user before subtests
  const { json: sessionData } = await api("GET", "/session");
  testUser = sessionData.user;

  await t.test("/_/usage renders AI Usage Dashboard heading", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("AI Usage Dashboard")
      );
      assert.ok(h1, "Should render AI Usage Dashboard heading");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage has filter controls", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("AI Usage Dashboard"));

      const searchFilter = container.querySelector("#search-filter");
      const roleFilter = container.querySelector("#role-filter");
      const statusFilter = container.querySelector("#status-filter");
      const dateRangeFilter = container.querySelector("#date-range-filter");

      assert.ok(searchFilter, "Search filter should exist");
      assert.ok(roleFilter, "Role filter should exist");
      assert.ok(statusFilter, "Status filter should exist");
      assert.ok(dateRangeFilter, "Date range filter should exist");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage table has expected columns", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      const table = await waitForElement(container, "table");
      assert.ok(table, "Table should exist");

      const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
        th.textContent.trim()
      );
      assert.ok(
        headers.some((h) => h.includes("User")),
        "Should have User column"
      );
      assert.ok(
        headers.some((h) => h.includes("Email")),
        "Should have Email column"
      );
      assert.ok(
        headers.some((h) => h.includes("User Role")),
        "Should have User Role column"
      );
      assert.ok(
        headers.some((h) => h.includes("Input Tokens")),
        "Should have Input Tokens column"
      );
      assert.ok(
        headers.some((h) => h.includes("Output Tokens")),
        "Should have Output Tokens column"
      );
      assert.ok(
        headers.some((h) => h.includes("Cost Limit")),
        "Should have Cost Limit column"
      );
      assert.ok(
        headers.some((h) => h.includes("Estimated Cost")),
        "Should have Estimated Cost column"
      );
      assert.ok(
        headers.some((h) => h.includes("Action")),
        "Should have Action column"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage: date range change to Last 30 Days works", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      const dateRange = container.querySelector("#date-range-filter");
      assert.ok(dateRange, "Date range filter should exist");

      dateRange.selectedIndex = 1; // "Last 30 Days"
      dateRange.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      assert.strictEqual(
        errors.length,
        0,
        `Errors after date range change: ${errors.map((e) => e.message)}`
      );
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage: Custom date range shows inputs", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      const dateRange = container.querySelector("#date-range-filter");
      dateRange.selectedIndex = 5; // "Custom"
      dateRange.dispatchEvent(new InputEvent("input", { bubbles: true }));

      const startDate = await waitForElement(container, "#custom-startDate", 5000);
      const endDate = container.querySelector("#custom-endDate");
      assert.ok(startDate, "Custom start date input should appear");
      assert.ok(endDate, "Custom end date input should appear");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage: search filter works", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      const searchInput = container.querySelector("#search-filter");
      assert.ok(searchInput, "Search input should exist");
      searchInput.value = testUser.email.substring(0, 5);
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(errors.length, 0, `Errors after search: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage: role filter works", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("AI Usage Dashboard"));

      const roleFilter = container.querySelector("#role-filter");
      assert.ok(roleFilter, "Role filter should exist");
      // Change to first non-default option if available
      if (roleFilter.options.length > 1) {
        roleFilter.selectedIndex = 1;
        roleFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
      }
      assert.strictEqual(
        errors.length,
        0,
        `Errors after role change: ${errors.map((e) => e.message)}`
      );
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage: status filter works", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("AI Usage Dashboard"));

      const statusFilter = container.querySelector("#status-filter");
      assert.ok(statusFilter, "Status filter should exist");
      statusFilter.value = "active";
      statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(
        errors.length,
        0,
        `Errors after status change: ${errors.map((e) => e.message)}`
      );
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage: View Details links exist", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      const viewLinks = container.querySelectorAll('a[href*="/_/users/"][href*="/usage"]');
      assert.ok(viewLinks.length > 0, "View Details links should exist");

      const firstLink = viewLinks[0];
      assert.ok(firstLink.textContent.includes("View Details"), "Link should say View Details");
      assert.ok(
        firstLink.getAttribute("href").includes("/usage"),
        "Link should point to user usage page"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});

test("User Usage Detail Tests", async (t) => {
  // Ensure testUser is available
  if (!testUser) {
    const { json: sessionData } = await api("GET", "/session");
    testUser = sessionData.user;
  }

  await t.test("/_/users/:id/usage renders Usage Statistics heading", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Usage Statistics")
      );
      assert.ok(h1, "Should render Usage Statistics heading");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id/usage has Back to Usage Dashboard link", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Usage Statistics"));

      // Find the back button (btn-outline-primary, not nav link)
      const backLink = container.querySelector('a.btn-outline-primary[href="/_/usage"]');
      assert.ok(backLink, "Back to Usage Dashboard link should exist");
      assert.ok(backLink.textContent.trim().includes("Back"), "Link should contain 'Back' text");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id/usage shows user info card", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
    try {
      const emailEl = await waitForElement(container, "*", (el) =>
        el.textContent.includes(testUser.email)
      );
      assert.ok(emailEl, "User email should be displayed");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id/usage has date range filter", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Usage Statistics"));

      const dateRangeFilter = container.querySelector("#date-range-filter");
      assert.ok(dateRangeFilter, "Date range filter should exist");

      // Verify date range options
      const options = Array.from(dateRangeFilter.options).map((o) => o.textContent.trim());
      assert.ok(options.includes("This Week"), "Should have This Week option");
      assert.ok(options.includes("Last 30 Days"), "Should have Last 30 Days option");
      assert.ok(options.includes("Custom"), "Should have Custom option");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id/usage: date range change works", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Usage Statistics"));

      const dateRange = container.querySelector("#date-range-filter");
      dateRange.selectedIndex = 1; // "Last 30 Days"
      dateRange.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      assert.strictEqual(
        errors.length,
        0,
        `Errors after date change: ${errors.map((e) => e.message)}`
      );
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id/usage: Custom date range shows inputs", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Usage Statistics"));

      const dateRange = container.querySelector("#date-range-filter");
      dateRange.selectedIndex = 5; // "Custom"
      dateRange.dispatchEvent(new InputEvent("input", { bubbles: true }));

      const startDate = await waitForElement(container, "#custom-startDate", 5000);
      const endDate = container.querySelector("#custom-endDate");
      assert.ok(startDate, "Custom start date input should appear");
      assert.ok(endDate, "Custom end date input should appear");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id/usage has section headings", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Usage Statistics"));
      // Wait for content to load
      await new Promise((r) => setTimeout(r, 1000));

      const allText = container.textContent;
      assert.ok(
        allText.includes("Usage by Model") || allText.includes("No usage data"),
        "Should have Usage by Model section or no-data message"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});
