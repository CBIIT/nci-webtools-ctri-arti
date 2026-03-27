import assert from "../assert.js";
import {
  installMockFetch,
  jsonResponse,
  mountApp,
  waitForCondition,
  waitForElement,
  waitForNetworkIdle,
} from "../helpers.js";
import test from "../test.js";

const ADMIN_ACCESS = { "*": { "*": true } };
const SUPER_USER_ACCESS = {
  "/tools/chat": { view: true },
  "/tools/chat-v2": { view: true },
  "/tools/consent-crafter": { view: true },
  "/tools/translator": { view: true },
  "/tools/semantic-search": { view: true },
  "/tools/export-conversations": { view: true },
  "/_/profile": { view: true },
};
const USER_ACCESS = {
  "/tools/consent-crafter": { view: true },
  "/tools/semantic-search": { view: true },
  "/tools/export-conversations": { view: true },
  "/_/profile": { view: true },
};

function accessForRole(roleID) {
  if (roleID === 1) return ADMIN_ACCESS;
  if (roleID === 2) return SUPER_USER_ACCESS;
  return USER_ACCESS;
}

const baseUser = {
  id: 1,
  email: "integration@example.org",
  firstName: "Integration",
  lastName: "Tester",
  status: "active",
  roleID: 1,
  budget: 10,
  remaining: 9.59,
  Role: { id: 1, name: "admin" },
  access: ADMIN_ACCESS,
};

const roles = [
  { id: 1, name: "admin" },
  { id: 2, name: "super_admin" },
  { id: 3, name: "user" },
];

function buildUsersResponse(url, user) {
  let data = [{ ...user, Role: user.Role }];
  const search = (url.searchParams.get("search") || "").toLowerCase();
  const status = url.searchParams.get("status");
  const roleID = url.searchParams.get("roleID");

  if (search) {
    const haystack = `${user.email} ${user.firstName} ${user.lastName}`.toLowerCase();
    data = haystack.includes(search) ? data : [];
  }

  if (status) {
    data = data.filter((entry) => entry.status === status);
  }

  if (roleID) {
    data = data.filter((entry) => String(entry.roleID) === String(roleID));
  }

  return { data, meta: { total: data.length } };
}

function installAdminMocks() {
  let currentUser = structuredClone(baseUser);

  return installMockFetch(async ({ url, request, input, init, originalFetch }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({ user: currentUser, expires: "2099-01-01T00:00:00.000Z" });
    }

    if (url.pathname === "/api/config") {
      return jsonResponse({ budgetLabel: "Monthly" });
    }

    if (url.pathname === "/api/v1/admin/roles") {
      return jsonResponse(roles);
    }

    if (url.pathname === "/api/v1/admin/users" && request.method === "GET") {
      return jsonResponse(buildUsersResponse(url, currentUser));
    }

    if (url.pathname === `/api/v1/admin/users/${currentUser.id}` && request.method === "GET") {
      return jsonResponse(currentUser);
    }

    if (url.pathname === "/api/v1/admin/users" && request.method === "POST") {
      const body = await request.json();
      const nextRole =
        roles.find((role) => role.id === Number(body.roleID || currentUser.roleID)) ||
        currentUser.Role;
      currentUser = {
        ...currentUser,
        ...body,
        id: currentUser.id,
        roleID: Number(body.roleID || currentUser.roleID),
        Role: { id: nextRole.id, name: nextRole.name },
        access: accessForRole(nextRole.id),
      };
      return jsonResponse(currentUser);
    }

    if (url.pathname === "/api/v1/admin/analytics") {
      const groupBy = url.searchParams.get("groupBy");

      if (groupBy === "user") {
        return jsonResponse({
          data: [
            {
              userID: currentUser.id,
              User: currentUser,
              Role: currentUser.Role,
              totalRequests: 3,
              usageCost: 0.3,
              guardrailCost: 0.01,
              totalCost: 0.31,
            },
          ],
          meta: { total: 1 },
        });
      }
    }

    return originalFetch(input, init);
  });
}

async function chooseInlineSelectOption(container, triggerSelector, label) {
  const trigger = await waitForElement(container, triggerSelector);
  trigger.click();

  const option = await waitForElement(container, ".custom-dropdown-option", (el) =>
    el.textContent.trim().includes(label)
  );
  option.click();

  return waitForElement(container, triggerSelector, (el) => el.textContent.includes(label), 2000);
}

test("Admin Page Tests", async (t) => {
  const restoreFetch = installAdminMocks();
  const testUser = baseUser;

  try {
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
        await waitForNetworkIdle();
        assert.strictEqual(
          errors.length,
          0,
          `Errors after search: ${errors.map((e) => e.message)}`
        );
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
        await waitForNetworkIdle();
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
          await waitForNetworkIdle();
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
        await waitForNetworkIdle();
        assert.strictEqual(
          errors.length,
          0,
          `Errors after inactive: ${errors.map((e) => e.message)}`
        );

        // Switch to active
        statusFilter.value = "active";
        statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
        await waitForNetworkIdle();
        assert.strictEqual(
          errors.length,
          0,
          `Errors after active: ${errors.map((e) => e.message)}`
        );

        // Switch back to All
        statusFilter.value = "";
        statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
        await waitForNetworkIdle();
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
        await waitForNetworkIdle();

        // Check for sort indicator
        const sortedTh = container.querySelector("table thead th");
        const hasIndicator =
          sortedTh.textContent.includes("↑") || sortedTh.textContent.includes("↓");
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
        const emailEl = await waitForElement(container, ".profile-card-email", (el) =>
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

        const noLimitCheckbox = container.querySelector("#noLimitCheckbox");
        const budgetInput = container.querySelector("#budget");

        const roleSelect = container.querySelector("#roleID");
        assert.ok(roleSelect, "Role select should exist");
        assert.ok(noLimitCheckbox, "No limit checkbox should exist");
        assert.ok(budgetInput, "Budget input should exist");

        // Change to Admin role -> should set noLimit=true
        await chooseInlineSelectOption(container, "#roleID", "Admin");
        await waitForElement(container, "#budget", (el) => el.disabled, 2000);
        assert.ok(noLimitCheckbox.checked, "Admin role should set noLimit to true");
        assert.ok(budgetInput.disabled, "Budget should be disabled for admin");

        // Change to User role -> should set budget=1, noLimit=false
        await chooseInlineSelectOption(container, "#roleID", "User");
        await waitForElement(container, "#budget", (el) => !el.disabled && el.value === "1", 2000);
        assert.ok(!noLimitCheckbox.checked, "User role should set noLimit to false");
        assert.ok(!budgetInput.disabled, "Budget should be enabled for user role");
        assert.strictEqual(budgetInput.value, "1", "User role should reset budget to the default");
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
          await waitForCondition(
            () => !budgetInput.disabled,
            1000,
            "admin unlimited off precondition"
          );
        }
        assert.ok(!budgetInput.disabled, "Budget should be enabled when noLimit is off");

        // Check noLimit
        noLimitCheckbox.checked = true;
        noLimitCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForCondition(() => budgetInput.disabled, 1000, "admin unlimited on");
        assert.ok(budgetInput.disabled, "Budget should be disabled when noLimit is on");

        // Uncheck noLimit
        noLimitCheckbox.checked = false;
        noLimitCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForCondition(() => !budgetInput.disabled, 1000, "admin unlimited off");
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

        await chooseInlineSelectOption(container, "#roleID", "User");

        const budgetInput = container.querySelector("#budget");
        const resetButton = container.querySelector(".profile-budget-reset-btn");
        assert.ok(resetButton, "Reset button should exist");
        assert.ok(!resetButton.disabled, "Reset button should be enabled for limited roles");

        // Change budget to a custom value
        budgetInput.value = "999";
        budgetInput.dispatchEvent(new Event("input", { bubbles: true }));
        assert.strictEqual(budgetInput.value, "999", "Budget should accept the custom value");

        // Click reset
        resetButton.click();
        await waitForElement(container, "#budget", (el) => el.value === "1", 2000);

        assert.strictEqual(budgetInput.value, "1", "Budget should reset to the role default");
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
  } finally {
    restoreFetch();
  }
});

test("Admin Usage Page Tests", async (t) => {
  const restoreFetch = installAdminMocks();

  try {
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
  } finally {
    restoreFetch();
  }
});
