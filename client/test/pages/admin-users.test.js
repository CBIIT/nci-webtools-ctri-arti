import assert from "../assert.js";
import {
  cleanupMountedApp,
  mountApp,
  primePrivacyNoticeAccepted,
  waitForCondition,
  waitForElement,
  waitForNetworkIdle,
} from "../helpers.js";
import test from "../test.js";

import { baseUser, chooseInlineSelectOption, installAdminMocks } from "./admin-helpers.js";

test("Admin Users Page Tests", async (t) => {
  const adminMocks = installAdminMocks();
  const testUser = baseUser;
  const restoreBrowserState = primePrivacyNoticeAccepted();

  try {
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
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users shows the Name column as Last, First", async () => {
      const { container, errors, dispose } = mountApp("/_/users");
      try {
        const nameCell = await waitForElement(container, "td", (el) =>
          el.textContent.includes(`${testUser.lastName}, ${testUser.firstName}`)
        );
        assert.ok(nameCell, "Should render the formatted user name");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
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
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
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
        cleanupMountedApp({ container, dispose });
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
        cleanupMountedApp({ container, dispose });
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
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users: status filter toggles between All/active/inactive", async () => {
      const { container, errors, dispose } = mountApp("/_/users");
      try {
        await waitForElement(container, "table");

        const statusFilter = container.querySelector("#status-filter");

        statusFilter.value = "inactive";
        statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
        await waitForNetworkIdle();
        assert.strictEqual(
          errors.length,
          0,
          `Errors after inactive: ${errors.map((e) => e.message)}`
        );

        statusFilter.value = "active";
        statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
        await waitForNetworkIdle();
        assert.strictEqual(
          errors.length,
          0,
          `Errors after active: ${errors.map((e) => e.message)}`
        );

        statusFilter.value = "";
        statusFilter.dispatchEvent(new InputEvent("input", { bubbles: true }));
        await waitForNetworkIdle();
        assert.strictEqual(errors.length, 0, `Errors after All: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users: column sorting shows sort indicators", async () => {
      const { container, errors, dispose } = mountApp("/_/users");
      try {
        await waitForElement(container, "table");

        const thElements = container.querySelectorAll("table thead th");
        assert.ok(thElements.length > 0, "Table should have header columns");

        thElements[0].click();
        await waitForNetworkIdle();

        const sortedTh = container.querySelector("table thead th");
        const hasIndicator =
          sortedTh.textContent.includes("↑") || sortedTh.textContent.includes("↓");
        assert.ok(hasIndicator, "Sort indicator should appear after clicking column header");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users: Name header sorts by lastName in the API request", async () => {
      const { container, errors, dispose } = mountApp("/_/users");
      try {
        await waitForElement(container, "table");
        adminMocks.clearUserListQueries();

        const thElements = container.querySelectorAll("table thead th");
        assert.ok(thElements.length > 0, "Table should have header columns");

        thElements[0].click();
        await waitForNetworkIdle();

        const lastQuery = adminMocks.userListQueries.at(-1);
        assert.ok(lastQuery, "Name sort should trigger a users API request");
        assert.strictEqual(lastQuery.sortBy, "lastName");
        assert.strictEqual(lastQuery.sortOrder, "desc");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
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
        cleanupMountedApp({ container, dispose });
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
        cleanupMountedApp({ container, dispose });
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
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users/:id renders Edit User form", async () => {
      const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
      try {
        const h1 = await waitForElement(container, "h1", (el) =>
          el.textContent.includes("Edit User")
        );
        assert.ok(h1, "Should render Edit User heading");

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
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users/:id shows email as read-only", async () => {
      const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
      try {
        await waitForElement(container, "#firstName");

        const emailInput = container.querySelector("#email");
        assert.ok(!emailInput, "Email should not be an editable input");

        const emailEl = await waitForElement(container, ".profile-card-email", (el) =>
          el.textContent.includes(testUser.email)
        );
        assert.ok(emailEl, "Email should be displayed as text");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
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

        await chooseInlineSelectOption(container, "#roleID", "Admin");
        await waitForElement(container, "#budget", (el) => el.disabled, 2000);
        assert.ok(noLimitCheckbox.checked, "Admin role should set noLimit to true");
        assert.ok(budgetInput.disabled, "Budget should be disabled for admin");

        await chooseInlineSelectOption(container, "#roleID", "User");
        await waitForElement(container, "#budget", (el) => !el.disabled && el.value === "1", 2000);
        assert.ok(!noLimitCheckbox.checked, "User role should set noLimit to false");
        assert.ok(!budgetInput.disabled, "Budget should be enabled for user role");
        assert.strictEqual(budgetInput.value, "1", "User role should reset budget to the default");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users/:id: unlimited toggle enables/disables budget", async () => {
      const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
      try {
        await waitForElement(container, "#firstName");

        const noLimitCheckbox = container.querySelector("#noLimitCheckbox");
        const budgetInput = container.querySelector("#budget");

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

        noLimitCheckbox.checked = true;
        noLimitCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForCondition(() => budgetInput.disabled, 1000, "admin unlimited on");
        assert.ok(budgetInput.disabled, "Budget should be disabled when noLimit is on");

        noLimitCheckbox.checked = false;
        noLimitCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForCondition(() => !budgetInput.disabled, 1000, "admin unlimited off");
        assert.ok(!budgetInput.disabled, "Budget should re-enable when noLimit is off");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
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

        budgetInput.value = "999";
        budgetInput.dispatchEvent(new Event("input", { bubbles: true }));
        assert.strictEqual(budgetInput.value, "999", "Budget should accept the custom value");

        resetButton.click();
        await waitForElement(container, "#budget", (el) => el.value === "1", 2000);

        assert.strictEqual(budgetInput.value, "1", "Budget should reset to the role default");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users/:id: form submission navigates to users list", async () => {
      const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
      try {
        const firstName = await waitForElement(container, "#firstName");

        firstName.value = "IntegrationTest";
        firstName.dispatchEvent(new Event("input", { bubbles: true }));

        const form = firstName.closest("form");
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

        const heading = await waitForElement(
          container,
          "h1",
          (el) => el.textContent.includes("Manage Users"),
          5000
        );
        assert.ok(heading, "Should navigate to users list after save");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
      }
    });
  } finally {
    restoreBrowserState();
    adminMocks.restore();
  }
});
