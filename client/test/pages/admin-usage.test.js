import assert from "../assert.js";
import {
  cleanupMountedApp,
  mountApp,
  primePrivacyNoticeAccepted,
  waitForElement,
} from "../helpers.js";
import test from "../test.js";

import { installAdminMocks } from "./admin-helpers.js";

test("Admin Usage Page Tests", async (t) => {
  const adminMocks = installAdminMocks();
  const restoreBrowserState = primePrivacyNoticeAccepted();

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
        cleanupMountedApp({ container, dispose });
      }
    });
  } finally {
    restoreBrowserState();
    adminMocks.restore();
  }
});
