import { AUTH_STATE_STORAGE_KEY, authSync } from "../../contexts/auth-context.js";
import { clearCachedData } from "../../utils/static-data.js";
import assert from "../assert.js";
import {
  installMockFetch,
  jsonResponse,
  mountApp,
  waitForCondition,
  waitForElement,
} from "../helpers.js";
import test from "../test.js";

const ADMIN_ACCESS = { "*": { "*": true } };

function stubReload() {
  const originalReload = authSync.reload;
  let count = 0;

  authSync.reload = () => {
    count++;
  };

  return {
    get count() {
      return count;
    },
    restore() {
      authSync.reload = originalReload;
    },
  };
}

function setPrivacyNoticeAccepted(value) {
  document.cookie = `privacyNoticeAccepted=${value}; path=/`;
}

function clearPrivacyNoticeAccepted() {
  document.cookie = "privacyNoticeAccepted=; max-age=0; path=/";
}

test("Home Page Tests", async (t) => {
  clearCachedData();
  localStorage.removeItem("userDetails");
  localStorage.removeItem(AUTH_STATE_STORAGE_KEY);
  const restoreFetch = installMockFetch(({ url }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({
        user: {
          id: 1,
          email: "integration@example.org",
          firstName: "Integration",
          lastName: "Tester",
          Role: { id: 1, name: "admin" },
          access: ADMIN_ACCESS,
        },
      });
    }
    if (url.pathname === "/api/config") {
      return jsonResponse({});
    }
    return null;
  });

  const { container, errors, dispose } = mountApp("/");

  try {
    await waitForElement(container, "h1", (el) => el.textContent.includes("Research Optimizer"));

    await t.test("/ renders Research Optimizer heading", async () => {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Research Optimizer")
      );
      assert.ok(h1, "Should render Research Optimizer heading");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/ renders all 4 tool cards", async () => {
      await waitForCondition(
        () => {
          const links = container.querySelectorAll("a.d-flex.align-items-center.my-3");
          return links.length === 4;
        },
        5000,
        "home links loaded"
      );

      const links = container.querySelectorAll("a.d-flex.align-items-center.my-3");
      assert.strictEqual(links.length, 4, `Expected 4 tool cards, got ${links.length}`);

      const titles = Array.from(links).map((link) =>
        link.querySelector(".font-title")?.textContent?.trim()
      );
      assert.ok(titles.includes("Chat"), "Should have Chat card");
      assert.ok(titles.includes("ConsentCrafter"), "Should have ConsentCrafter card");
      assert.ok(titles.includes("Translator"), "Should have Translator card");
      assert.ok(titles.includes("New Tools"), "Should have New Tools card");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/ tool card links point to correct URLs", async () => {
      await waitForCondition(
        () => {
          const hrefs = Array.from(
            container.querySelectorAll("a.d-flex.align-items-center.my-3")
          ).map((link) => link.getAttribute("href"));
          return (
            hrefs.includes("/tools/chat") &&
            hrefs.includes("/tools/consent-crafter") &&
            hrefs.includes("/tools/translator")
          );
        },
        5000,
        "home link hrefs loaded"
      );

      const links = container.querySelectorAll("a.d-flex.align-items-center.my-3");
      const hrefs = Array.from(links).map((link) => link.getAttribute("href"));
      assert.ok(hrefs.includes("/tools/chat"), "Should have /tools/chat link");
      assert.ok(
        hrefs.includes("/tools/consent-crafter"),
        "Should have /tools/consent-crafter link"
      );
      assert.ok(hrefs.includes("/tools/translator"), "Should have /tools/translator link");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/ New Tools card has disabled state", async () => {
      const newToolsLink = Array.from(
        container.querySelectorAll("a.d-flex.align-items-center.my-3")
      ).find((link) => link.querySelector(".font-title")?.textContent?.trim() === "New Tools");

      assert.ok(newToolsLink, "New Tools link should exist");
      assert.ok(
        newToolsLink.classList.contains("disabled-link"),
        "New Tools should have disabled-link class"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/ Login button is hidden when authenticated", async () => {
      await waitForCondition(
        () => window.__authContext?.().status() === "LOADED",
        5000,
        "auth loaded"
      );

      const loginLink = container.querySelector('a[href="/api/v1/login"]');
      assert.ok(!loginLink, "Login button should be hidden when user is authenticated");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });
  } finally {
    restoreFetch();
    dispose();
    if (container.parentNode === document.body) {
      document.body.removeChild(container);
    }
  }
});

test("Auth Sync Tests", async (t) => {
  await t.test("authenticated tab reloads on logout event", async () => {
    localStorage.removeItem("userDetails");
    localStorage.removeItem(AUTH_STATE_STORAGE_KEY);

    const restoreFetch = installMockFetch(({ url }) => {
      if (url.pathname === "/api/v1/session") {
        return jsonResponse({
          user: {
            id: 1,
            email: "integration@example.org",
            firstName: "Integration",
            lastName: "Tester",
            Role: { id: 1, name: "admin" },
            access: ADMIN_ACCESS,
          },
        });
      }
      return null;
    });

    const reload = stubReload();
    const { container, errors, dispose } = mountApp("/");

    try {
      await waitForCondition(
        () =>
          window.__authContext?.().status() === "LOADED" && window.__authContext?.().isLoggedIn(),
        5000,
        "authenticated auth loaded"
      );

      authSync.handleStorageEvent({
        key: AUTH_STATE_STORAGE_KEY,
        newValue: JSON.stringify({ isLoggedIn: false, at: Date.now() }),
      });

      await waitForCondition(() => reload.count === 1, 2000, "logout sync reload");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      reload.restore();
      restoreFetch();
      dispose();
      if (container.parentNode === document.body) {
        document.body.removeChild(container);
      }
    }
  });

  await t.test("logged out tab reloads on login event", async () => {
    localStorage.removeItem("userDetails");
    localStorage.removeItem(AUTH_STATE_STORAGE_KEY);

    const restoreFetch = installMockFetch(({ url }) => {
      if (url.pathname === "/api/v1/session") {
        return jsonResponse({ user: null, expires: null });
      }
      return null;
    });

    const reload = stubReload();
    const { container, errors, dispose } = mountApp("/");

    try {
      await waitForCondition(
        () =>
          window.__authContext?.().status() === "LOADED" && !window.__authContext?.().isLoggedIn(),
        5000,
        "logged out auth loaded"
      );

      authSync.handleStorageEvent({
        key: AUTH_STATE_STORAGE_KEY,
        newValue: JSON.stringify({ isLoggedIn: true, at: Date.now() }),
      });

      await waitForCondition(() => reload.count === 1, 2000, "login sync reload");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      reload.restore();
      restoreFetch();
      dispose();
      if (container.parentNode === document.body) {
        document.body.removeChild(container);
      }
    }
  });
});

test("Inactivity Dialog Tests", async (t) => {
  await t.test("warning appears and Extend Session works", async () => {
    localStorage.removeItem("userDetails");
    localStorage.removeItem(AUTH_STATE_STORAGE_KEY);
    sessionStorage.removeItem("sessionTimedOut");
    setPrivacyNoticeAccepted("true");

    const nearExpiry = new Date(Date.now() + 10 * 1000).toISOString();
    const initialExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const farFutureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const sessionUser = {
      id: 1,
      email: "integration@example.org",
      firstName: "Integration",
      lastName: "Tester",
      Role: { id: 1, name: "admin" },
      access: ADMIN_ACCESS,
    };
    let shouldConfirmExpiringSession = false;

    const restoreFetch = installMockFetch(({ url, request }) => {
      if (url.pathname === "/api/v1/session" && request.method === "GET") {
        return jsonResponse({
          user: sessionUser,
          expires: shouldConfirmExpiringSession ? nearExpiry : initialExpiry,
        });
      }

      if (url.pathname === "/api/v1/session" && request.method === "POST") {
        return jsonResponse({
          user: sessionUser,
          expires: farFutureExpiry,
        });
      }

      return null;
    });

    const { container, errors, dispose } = mountApp("/");

    try {
      await waitForCondition(
        () =>
          window.__authContext?.().status() === "LOADED" && !!window.__authContext?.().expires(),
        5000,
        "inactivity auth loaded"
      );

      const authCtx = window.__authContext?.();
      await waitForCondition(
        () => !container.querySelector("dialog[open]"),
        1000,
        "privacy notice hidden"
      );
      authCtx.updateExpires(nearExpiry);
      shouldConfirmExpiringSession = true;

      const warningModal = await waitForElement(container, ".inactivity-warning-modal", 5000);
      assert.ok(warningModal, "Warning modal should appear when session is about to expire");

      const warningText = container.querySelector(".inactivity-warning-text");
      assert.ok(warningText, "Warning text should be present");
      assert.ok(
        warningText.textContent.includes("about to expire"),
        "Warning should mention expiration"
      );

      const extendBtn = container.querySelector(".extend-button");
      assert.ok(extendBtn, "Extend Session button should be present");
      extendBtn.click();

      await waitForCondition(
        () => !container.querySelector(".inactivity-warning-modal"),
        5000,
        "warning modal close after extend"
      );

      assert.ok(
        !container.querySelector(".inactivity-warning-modal"),
        "Warning modal should be gone after extending session"
      );
      assert.strictEqual(authCtx.expires(), farFutureExpiry);
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      restoreFetch();
      dispose();
      if (container.parentNode === document.body) {
        document.body.removeChild(container);
      }
      clearPrivacyNoticeAccepted();
    }
  });

  await t.test("skips warning when server expiry was rolled forward", async () => {
    localStorage.removeItem("userDetails");
    localStorage.removeItem(AUTH_STATE_STORAGE_KEY);
    sessionStorage.removeItem("sessionTimedOut");
    setPrivacyNoticeAccepted("true");

    const nearExpiry = new Date(Date.now() + 10 * 1000).toISOString();
    const initialExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const farFutureExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const sessionUser = {
      id: 1,
      email: "integration@example.org",
      firstName: "Integration",
      lastName: "Tester",
      Role: { id: 1, name: "admin" },
      access: ADMIN_ACCESS,
    };

    let shouldRollSessionForward = false;

    const restoreFetch = installMockFetch(({ url, request }) => {
      if (url.pathname === "/api/v1/session" && request.method === "GET") {
        return jsonResponse({
          user: sessionUser,
          expires: shouldRollSessionForward ? farFutureExpiry : initialExpiry,
        });
      }
      return null;
    });

    const { container, errors, dispose } = mountApp("/");

    try {
      await waitForCondition(
        () =>
          window.__authContext?.().status() === "LOADED" && !!window.__authContext?.().expires(),
        5000,
        "inactivity auth loaded"
      );

      const authCtx = window.__authContext?.();
      await waitForCondition(
        () => !container.querySelector("dialog[open]"),
        1000,
        "privacy notice hidden"
      );
      authCtx.updateExpires(nearExpiry);
      shouldRollSessionForward = true;

      await waitForCondition(
        () => authCtx.expires() === farFutureExpiry,
        5000,
        "rolled forward session expiry"
      );

      assert.ok(
        !container.querySelector(".inactivity-warning-modal"),
        "Warning modal should stay hidden when server expiry was extended"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      restoreFetch();
      dispose();
      if (container.parentNode === document.body) {
        document.body.removeChild(container);
      }
      clearPrivacyNoticeAccepted();
    }
  });
});
