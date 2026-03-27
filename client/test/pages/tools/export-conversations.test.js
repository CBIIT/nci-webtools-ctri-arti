import { AUTH_STATE_STORAGE_KEY } from "../../../contexts/auth-context.js";
import { dbFactory } from "../../../models/database.js";
import { clearCachedData } from "../../../utils/static-data.js";
import assert from "../../assert.js";
import {
  installMockFetch,
  jsonResponse,
  mountApp,
  waitForCondition,
  waitForElement,
} from "../../helpers.js";
import test from "../../test.js";

const ADMIN_ACCESS = { "*": { "*": true } };

const sessionUser = {
  id: 1,
  email: "integration@example.org",
  firstName: "Integration",
  lastName: "Tester",
  Role: { id: 1, name: "admin" },
  access: ADMIN_ACCESS,
};

function primeAuthenticatedBrowserState(user = sessionUser) {
  clearCachedData();
  localStorage.setItem("userDetails", JSON.stringify(user));
  localStorage.removeItem(AUTH_STATE_STORAGE_KEY);
  document.cookie = "privacyNoticeAccepted=true; path=/";

  return () => {
    clearCachedData();
    localStorage.removeItem("userDetails");
    localStorage.removeItem(AUTH_STATE_STORAGE_KEY);
    document.cookie = "privacyNoticeAccepted=; max-age=0; path=/";
  };
}

function installSessionMock() {
  return installMockFetch(({ url }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({ user: sessionUser, expires: "2099-01-01T00:00:00.000Z" });
    }
    if (url.pathname === "/api/config") {
      return jsonResponse({});
    }
    return null;
  });
}

function overrideDbFactory(getDBImpl) {
  const originalGetDB = dbFactory.getDB;
  dbFactory.getDB = getDBImpl;

  return () => {
    dbFactory.getDB = originalGetDB;
  };
}

test("Export Conversations Page Tests", async (t) => {
  await t.test("renders the export table with 0 records when IndexedDB is empty", async () => {
    const restoreBrowserState = primeAuthenticatedBrowserState();
    const restoreFetch = installSessionMock();
    const restoreDbFactory = overrideDbFactory(async () => ({
      db: {
        async getAll(storeName) {
          assert.strictEqual(storeName, "conversations");
          return [];
        },
      },
    }));

    const { container, errors, dispose } = mountApp("/tools/export-conversations");

    try {
      await waitForElement(container, "table.export-table");
      await waitForCondition(
        () => container.textContent.includes("0 records found in browser storage."),
        5000,
        "empty export table message"
      );

      const stats = Array.from(container.querySelectorAll(".export-stat-value")).map((el) =>
        el.textContent.trim()
      );
      const exportButton = container.querySelector(".export-btn");

      assert.deepStrictEqual(stats, ["0", "0"], "Should show zero conversation and message stats");
      assert.ok(exportButton?.disabled, "Export button should be disabled with 0 records");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      restoreBrowserState();
      restoreDbFactory();
      restoreFetch();
      dispose();
      if (container.parentNode === document.body) {
        document.body.removeChild(container);
      }
    }
  });

  await t.test("renders the export table with 0 records when IndexedDB fails to load", async () => {
    const restoreBrowserState = primeAuthenticatedBrowserState();
    const restoreFetch = installSessionMock();
    const restoreDbFactory = overrideDbFactory(async () => {
      throw new Error("IndexedDB unavailable");
    });

    const { container, errors, dispose } = mountApp("/tools/export-conversations");

    try {
      await waitForElement(container, "table.export-table");
      await waitForCondition(
        () =>
          container.textContent.includes("Browser storage could not be loaded. Showing 0 records."),
        5000,
        "failed export table message"
      );

      const exportButton = container.querySelector(".export-btn");
      assert.ok(exportButton?.disabled, "Export button should be disabled after DB load failure");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      restoreBrowserState();
      restoreDbFactory();
      restoreFetch();
      dispose();
      if (container.parentNode === document.body) {
        document.body.removeChild(container);
      }
    }
  });
});
