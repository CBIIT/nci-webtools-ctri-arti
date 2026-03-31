/**
 * Page smoke tests — real mounted pages against the server with minimal user flows.
 */
import assert from "/test/assert.js";
import {
  cleanupMountedApp,
  mountApp,
  primePrivacyNoticeAccepted,
  waitForElement,
  waitForNetworkIdle,
} from "/test/helpers.js";
import test from "/test/test.js";

import { getSmokeTestUser } from "./smoke-helpers.js";

test("Page Smoke Tests", async (t) => {
  const testUser = await getSmokeTestUser();
  const restoreBrowserState = primePrivacyNoticeAccepted();

  try {
    await t.test("/_/users shows test user in table", async () => {
      const { container, errors, dispose } = mountApp("/_/users");
      try {
        const cell = await waitForElement(container, "td", (el) =>
          el.textContent.includes(testUser.email)
        );
        assert.ok(cell, "Test user email should appear in users table");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
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
        cleanupMountedApp({ container, dispose });
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
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users/:id/usage shows user usage", async () => {
      const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}/usage`);
      try {
        const el = await waitForElement(container, "*", (node) =>
          node.textContent.includes(testUser.email)
        );
        assert.ok(el, "User usage page should show test user email");
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/profile: update firstName/lastName", async () => {
      const { container, errors, dispose } = mountApp("/_/profile");
      try {
        const firstName = await waitForElement(container, "#firstName");
        const lastName = container.querySelector("#lastName");
        assert.ok(firstName, "firstName input should exist");
        assert.ok(lastName, "lastName input should exist");

        firstName.value = "SmokeFirst";
        firstName.dispatchEvent(new Event("input", { bubbles: true }));
        lastName.value = "SmokeLast";
        lastName.dispatchEvent(new Event("input", { bubbles: true }));

        const form = firstName.closest("form");
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

        await waitForNetworkIdle();
        assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
      } finally {
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/users/:id: edit and save user", async () => {
      const { container, errors, dispose } = mountApp(`/_/users/${testUser.id}`);
      try {
        const firstName = await waitForElement(container, "#firstName");
        assert.ok(firstName, "firstName input should exist");

        firstName.value = "EditedSmoke";
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

    await t.test("/_/users: search and status filter", async () => {
      const { container, errors, dispose } = mountApp("/_/users");
      try {
        await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

        const searchInput = container.querySelector("#search-filter");
        assert.ok(searchInput, "Search input should exist");
        searchInput.value = testUser.email.substring(0, 5);
        searchInput.dispatchEvent(new Event("input", { bubbles: true }));
        await waitForNetworkIdle();
        assert.strictEqual(
          errors.length,
          0,
          `Errors after search: ${errors.map((e) => e.message)}`
        );

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

        statusFilter.value = "active";
        statusFilter.dispatchEvent(new Event("change", { bubbles: true }));
        await waitForNetworkIdle();
        assert.strictEqual(
          errors.length,
          0,
          `Errors after status reset: ${errors.map((e) => e.message)}`
        );
      } finally {
        cleanupMountedApp({ container, dispose });
      }
    });

    await t.test("/_/usage: date range filter", async () => {
      const { container, errors, dispose } = mountApp("/_/usage");
      try {
        await waitForElement(container, "td", (el) => el.textContent.includes(testUser.email));

        const dateRange = container.querySelector("#date-range-filter");
        assert.ok(dateRange, "Date range filter should exist");

        dateRange.selectedIndex = 1;
        dateRange.dispatchEvent(new InputEvent("input", { bubbles: true }));
        await waitForNetworkIdle();
        assert.strictEqual(
          errors.length,
          0,
          `Errors after date range change: ${errors.map((e) => e.message)}`
        );

        dateRange.selectedIndex = 5;
        dateRange.dispatchEvent(new InputEvent("input", { bubbles: true }));

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
        cleanupMountedApp({ container, dispose });
      }
    });
  } finally {
    restoreBrowserState();
  }
});
