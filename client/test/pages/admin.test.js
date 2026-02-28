import assert from "../assert.js";
import { mountApp, waitForElement } from "../helpers.js";
import test from "../test.js";

test("Admin Page Tests", async (t) => {
  await t.test("/_/users renders Manage Users page", async () => {
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
