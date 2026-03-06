import assert from "../assert.js";
import { mountApp, waitForElement } from "../helpers.js";
import test from "../test.js";

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

test("Admin Page Tests", async (t) => {
  // Fetch session to get test user before subtests
  const { json: sessionData } = await api("GET", "/session");
  testUser = sessionData.user;

  // ── Users List Page ─────────────────────────────────────────────────────

  await t.test("/_/users renders Manage Users heading and table", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Manage Users")
      );
      assert.ok(h1, "Should render Manage Users heading");
      const table = await waitForElement(container, "table");
      assert.ok(table, "Should render a data table");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users has filter controls (search, role, status)", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "table");

      const searchFilter = container.querySelector("#search-filter");
      const roleFilter = container.querySelector("#role-filter");
      const statusFilter = container.querySelector("#status-filter");

      assert.ok(searchFilter, "Search filter should exist");
      assert.ok(roleFilter, "Role filter should exist");
      assert.ok(statusFilter, "Status filter should exist");
      assert.strictEqual(searchFilter.type, "text", "Search should be text input");
      assert.strictEqual(roleFilter.tagName, "SELECT", "Role filter should be a select");
      assert.strictEqual(statusFilter.tagName, "SELECT", "Status filter should be a select");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users: search filter with 3+ chars works", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      const searchInput = container.querySelector("#search-filter");
      searchInput.value = testUser.email.substring(0, 5);
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 500));
      assert.strictEqual(errors.length, 0, `Errors after search: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users: search filter with <3 chars doesn't error", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "table");

      const searchInput = container.querySelector("#search-filter");
      searchInput.value = "ab";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(
        errors.length,
        0,
        `Errors after short search: ${errors.map((e) => e.message)}`
      );
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users: role filter change works", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "table");

      const roleFilter = container.querySelector("#role-filter");
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

  await t.test("/_/users: status filter toggles between All/active/inactive", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "table");

      const statusFilter = container.querySelector("#status-filter");

      // Switch to inactive
      statusFilter.value = "inactive";
      statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(
        errors.length,
        0,
        `Errors after inactive: ${errors.map((e) => e.message)}`
      );

      // Switch to active
      statusFilter.value = "active";
      statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(errors.length, 0, `Errors after active: ${errors.map((e) => e.message)}`);

      // Switch back to All
      statusFilter.value = "";
      statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(errors.length, 0, `Errors after All: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users: column sorting shows sort indicators", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "table");

      const thElements = container.querySelectorAll("table thead th");
      assert.ok(thElements.length > 0, "Table should have header columns");

      // Click first sortable column (Name)
      thElements[0].click();
      await new Promise((r) => setTimeout(r, 300));

      // Check for sort indicator
      const sortedTh = container.querySelector("table thead th");
      const hasIndicator = sortedTh.textContent.includes("↑") || sortedTh.textContent.includes("↓");
      assert.ok(hasIndicator, "Sort indicator should appear after clicking column header");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users: pagination buttons exist", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "table");

      const buttons = container.querySelectorAll("button.btn-outline-primary");
      const prevButton = Array.from(buttons).find((b) => b.textContent.includes("Previous"));
      const nextButton = Array.from(buttons).find((b) => b.textContent.includes("Next"));

      assert.ok(prevButton, "Previous button should exist");
      assert.ok(nextButton, "Next button should exist");
      assert.ok(prevButton.disabled, "Previous should be disabled on page 1");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users: Edit links exist and point to correct URLs", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      const editLinks = container.querySelectorAll('a[href^="/_/users/"]');
      assert.ok(editLinks.length > 0, "Edit links should exist");

      const editLink = Array.from(editLinks).find((a) => a.textContent.includes("Edit"));
      assert.ok(editLink, "Edit link with text should exist");
      assert.ok(
        /\/_\/users\/\d+/.test(editLink.getAttribute("href")),
        "Edit link should point to /_/users/{id}"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users: active users show success badge", async () => {
    const { container, errors, dispose } = mountApp("/_/users");
    try {
      await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

      const badges = container.querySelectorAll(".badge.text-bg-success");
      assert.ok(badges.length > 0, "Active user badges should exist with text-bg-success class");

      const activeBadge = Array.from(badges).find((b) =>
        b.textContent.toLowerCase().includes("active")
      );
      assert.ok(activeBadge, "Active badge should show 'active' text");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  // ── User Edit Page ──────────────────────────────────────────────────────

  await t.test("/_/users/:id renders Edit User form", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Edit User")
      );
      assert.ok(h1, "Should render Edit User heading");

      // Wait for form to load
      const firstName = await waitForElement(container, "#firstName");
      const lastName = container.querySelector("#lastName");
      const status = container.querySelector("#status");
      const roleID = container.querySelector("#roleID");
      const budget = container.querySelector("#budget");

      assert.ok(firstName, "firstName input should exist");
      assert.ok(lastName, "lastName input should exist");
      assert.ok(status, "status select should exist");
      assert.ok(roleID, "roleID select should exist");
      assert.ok(budget, "budget input should exist");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id shows email as read-only", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      await waitForElement(container, "#firstName");

      // Email should be displayed as text, not an input
      const emailInput = container.querySelector("#email");
      assert.ok(!emailInput, "Email should not be an editable input");

      // Email should appear in the page content
      const emailEl = await waitForElement(container, "h1.fs-3", (el) =>
        el.textContent.includes(testUser.email)
      );
      assert.ok(emailEl, "Email should be displayed as text");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id: role change updates budget defaults", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      await waitForElement(container, "#firstName");

      const roleSelect = container.querySelector("#roleID");
      const noLimitCheckbox = container.querySelector("#noLimitCheckbox");
      const budgetInput = container.querySelector("#budget");

      assert.ok(roleSelect, "Role select should exist");
      assert.ok(noLimitCheckbox, "No limit checkbox should exist");
      assert.ok(budgetInput, "Budget input should exist");

      // Change to Admin role (id=1) -> should set noLimit=true
      roleSelect.value = "1";
      roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      assert.ok(noLimitCheckbox.checked, "Admin role should set noLimit to true");
      assert.ok(budgetInput.disabled, "Budget should be disabled for admin");

      // Change to User role (id=3) -> should set budget=1, noLimit=false
      roleSelect.value = "3";
      roleSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      assert.ok(!noLimitCheckbox.checked, "User role should set noLimit to false");
      assert.ok(!budgetInput.disabled, "Budget should be enabled for user role");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id: unlimited toggle enables/disables budget", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      await waitForElement(container, "#firstName");

      const noLimitCheckbox = container.querySelector("#noLimitCheckbox");
      const budgetInput = container.querySelector("#budget");

      // First ensure noLimit is unchecked
      if (noLimitCheckbox.checked) {
        noLimitCheckbox.checked = false;
        noLimitCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(!budgetInput.disabled, "Budget should be enabled when noLimit is off");

      // Check noLimit
      noLimitCheckbox.checked = true;
      noLimitCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      assert.ok(budgetInput.disabled, "Budget should be disabled when noLimit is on");

      // Uncheck noLimit
      noLimitCheckbox.checked = false;
      noLimitCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      assert.ok(!budgetInput.disabled, "Budget should re-enable when noLimit is off");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id: Reset button resets budget to role default", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      await waitForElement(container, "#firstName");

      const budgetInput = container.querySelector("#budget");
      const resetButton = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === "Reset" && b.type === "button"
      );
      assert.ok(resetButton, "Reset button should exist");

      // Change budget to a custom value
      budgetInput.value = "999";
      budgetInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));

      // Click reset
      resetButton.click();
      await new Promise((r) => setTimeout(r, 200));

      // Budget should reset to role default (not 999)
      assert.notStrictEqual(budgetInput.value, "999", "Budget should not be 999 after reset");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id: Cancel link points to /_/users", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      await waitForElement(container, "#firstName");

      // Find the Cancel button within the form area (btn-outline-secondary)
      const cancelLink = container.querySelector('a.btn-outline-secondary[href="/_/users"]');
      assert.ok(cancelLink, "Cancel link should exist with href=/_/users");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/users/:id: form submission navigates to users list", async () => {
    const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
    try {
      const firstName = await waitForElement(container, "#firstName");

      // Change firstName and submit
      firstName.value = "IntegrationTest";
      firstName.dispatchEvent(new Event("input", { bubbles: true }));

      const form = firstName.closest("form");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

      // Wait for navigation to users list
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
});

test("Admin Usage Page Tests", async (t) => {
  await t.test("/_/usage renders AI Usage Dashboard page", async () => {
    const { container, errors, dispose } = mountApp("/_/usage");
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("AI Usage Dashboard")
      );
      assert.ok(h1, "Should render AI Usage Dashboard heading");
      const table = await waitForElement(container, "table");
      assert.ok(table, "Should render a data table");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});
