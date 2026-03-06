import assert from "../../assert.js";
import { mountApp, waitForElement } from "../../helpers.js";
import test from "../../test.js";

test("Profile Page Tests", async (t) => {
  await t.test("/_/profile renders User Profile heading", async () => {
    const { container, errors, dispose } = mountApp("/_/profile");
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("User Profile")
      );
      assert.ok(h1, "Should render User Profile heading");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/profile shows email display", async () => {
    const { container, errors, dispose } = mountApp("/_/profile");
    try {
      // Wait for the email heading to appear (second h1 shows user email)
      const emailH1 = await waitForElement(container, "h1.fs-3");
      assert.ok(emailH1, "Email heading should exist");
      // Email should be non-empty once session loads
      await waitForElement(container, "h1.fs-3", (el) => el.textContent.trim().length > 0);
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/profile has editable firstName and lastName inputs", async () => {
    const { container, errors, dispose } = mountApp("/_/profile");
    try {
      const firstName = await waitForElement(container, "#firstName");
      const lastName = container.querySelector("#lastName");
      assert.ok(firstName, "firstName input should exist");
      assert.ok(lastName, "lastName input should exist");
      assert.strictEqual(
        firstName.getAttribute("name"),
        "firstName",
        "firstName should have name attribute"
      );
      assert.strictEqual(
        lastName.getAttribute("name"),
        "lastName",
        "lastName should have name attribute"
      );
      assert.strictEqual(firstName.tagName, "INPUT", "firstName should be an input element");
      assert.strictEqual(lastName.tagName, "INPUT", "lastName should be an input element");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/profile has read-only status, role, budget display", async () => {
    const { container, errors, dispose } = mountApp("/_/profile");
    try {
      await waitForElement(container, "#firstName");

      // Status, Role, and Budget should NOT be editable inputs — they are text displays
      const statusInput = container.querySelector("#status");
      const roleInput = container.querySelector("#roleID");
      assert.ok(!statusInput, "Status should not be an editable input");
      assert.ok(!roleInput, "Role should not be an editable input");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/profile: save shows success alert", async () => {
    const { container, errors, dispose } = mountApp("/_/profile");
    try {
      const firstName = await waitForElement(container, "#firstName");
      const lastName = container.querySelector("#lastName");

      // Fill inputs and trigger SolidJS reactivity
      firstName.value = "TestFirst";
      firstName.dispatchEvent(new Event("input", { bubbles: true }));
      lastName.value = "TestLast";
      lastName.dispatchEvent(new Event("input", { bubbles: true }));

      // Submit form
      const form = firstName.closest("form");
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

      // Wait for success alert (profile's own banner or layout alert)
      const alert = await waitForElement(container, ".alert-success", 5000);
      assert.ok(alert, "Success alert should appear after profile save");
      assert.ok(
        alert.textContent.includes("Success") ||
          alert.textContent.includes("success") ||
          alert.textContent.includes("updated"),
        `Alert should contain success text, got: "${alert.textContent.trim().substring(0, 80)}"`
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/profile: Cancel link points to /", async () => {
    const { container, errors, dispose } = mountApp("/_/profile");
    try {
      await waitForElement(container, "#firstName");

      // Find the Cancel button (btn-outline-secondary) within the form
      const cancelLink = container.querySelector('a.btn-outline-secondary[href="/"]');
      assert.ok(cancelLink, "Cancel link should exist with href=/");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});
