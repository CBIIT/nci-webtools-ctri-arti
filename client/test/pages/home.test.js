import { clearCachedData } from "../../utils/static-data.js";
import assert from "../assert.js";
import {
  cleanupMountedApp,
  installMockFetch,
  jsonResponse,
  mountApp,
  primePrivacyNoticeAccepted,
  waitForCondition,
  waitForElement,
} from "../helpers.js";
import test from "../test.js";

const ADMIN_ACCESS = { "*": { "*": true } };

function getHomeCards(container) {
  return Array.from(container.querySelectorAll("a.d-flex.align-items-center.my-3")).map((link) => ({
    link,
    href: link.getAttribute("href"),
    title: link.querySelector(".font-title")?.textContent?.trim(),
  }));
}

test("Home Page Tests", async (t) => {
  clearCachedData();
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
        access: ADMIN_ACCESS,
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
      await waitForCondition(() => getHomeCards(container).length === 4, 5000, "home links loaded");

      const cards = getHomeCards(container);
      assert.strictEqual(cards.length, 4, `Expected 4 tool cards, got ${cards.length}`);

      const titles = cards.map((card) => card.title);
      assert.ok(titles.includes("Chat"), "Should have Chat card");
      assert.ok(titles.includes("ConsentCrafter"), "Should have ConsentCrafter card");
      assert.ok(titles.includes("Translator"), "Should have Translator card");
      assert.ok(titles.includes("New Tools"), "Should have New Tools card");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/ tool card links point to correct URLs", async () => {
      await waitForCondition(
        () =>
          ["/tools/chat", "/tools/consent-crafter", "/tools/translator"].every((href) =>
            getHomeCards(container).some((card) => card.href === href)
          ),
        5000,
        "home link hrefs loaded"
      );

      const hrefs = getHomeCards(container).map((card) => card.href);
      assert.ok(hrefs.includes("/tools/chat"), "Should have /tools/chat link");
      assert.ok(
        hrefs.includes("/tools/consent-crafter"),
        "Should have /tools/consent-crafter link"
      );
      assert.ok(hrefs.includes("/tools/translator"), "Should have /tools/translator link");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/ New Tools card has disabled state", async () => {
      const newToolsCard = getHomeCards(container).find((card) => card.title === "New Tools");
      const newToolsLink = newToolsCard?.link;

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
    cleanupMountedApp({ container, dispose, restoreFetch });
  }
});

test("Home Page Access Tests", async (t) => {
  clearCachedData();

  const restoreFetch = installMockFetch(({ url }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({
        user: {
          id: 3,
          email: "integration@example.org",
          firstName: "Integration",
          lastName: "Tester",
          Role: { id: 3, name: "user" },
          access: {
            "/tools/consent-crafter": { view: true },
            "/tools/translator": { view: true },
            "/_/profile": { view: true },
          },
        },
        access: {
          "/tools/consent-crafter": { view: true },
          "/tools/translator": { view: true },
          "/_/profile": { view: true },
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
    await waitForCondition(
      () => window.__authContext?.().status() === "LOADED",
      5000,
      "auth loaded"
    );

    await t.test("/ shows translator for regular users with policy access", async () => {
      await waitForCondition(
        () => {
          const titles = getHomeCards(container).map((card) => card.title);
          return (
            !titles.includes("Chat") &&
            titles.includes("ConsentCrafter") &&
            titles.includes("Translator") &&
            titles.includes("New Tools")
          );
        },
        5000,
        "home policy links applied"
      );

      const titles = getHomeCards(container).map((card) => card.title);

      assert.ok(!titles.includes("Chat"), "Should hide Chat card");
      assert.ok(titles.includes("ConsentCrafter"), "Should keep ConsentCrafter card");
      assert.ok(titles.includes("Translator"), "Should show Translator card");
      assert.ok(titles.includes("New Tools"), "Should keep New Tools card");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });
  } finally {
    cleanupMountedApp({ container, dispose, restoreFetch });
  }
});

test("Protected Route Access Tests", async (t) => {
  clearCachedData();

  const restoreFetch = installMockFetch(({ url }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({
        user: {
          id: 3,
          email: "integration@example.org",
          firstName: "Integration",
          lastName: "Tester",
          Role: { id: 3, name: "user" },
          access: {
            "/tools/consent-crafter": { view: true },
            "/_/profile": { view: true },
          },
        },
        access: {
          "/tools/consent-crafter": { view: true },
          "/_/profile": { view: true },
        },
      });
    }
    if (url.pathname === "/api/config") {
      return jsonResponse({});
    }
    return null;
  });

  const { container, errors, dispose } = mountApp("/tools/chat");

  try {
    await waitForCondition(
      () => window.__authContext?.().status() === "LOADED",
      5000,
      "auth loaded"
    );

    await t.test("/tools/chat does not render for a user without access", async () => {
      await waitForCondition(
        () => container.querySelector("h1")?.textContent?.includes("Research Optimizer"),
        5000,
        "redirected home"
      );

      assert.ok(
        !container.textContent.includes("Standard Chat"),
        "Chat UI should not render without route access"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });
  } finally {
    clearCachedData();
    cleanupMountedApp({ container, dispose, restoreFetch });
  }
});

test("Inactivity Dialog Tests", async (t) => {
  await t.test("warning appears and Extend Session works", async () => {
    sessionStorage.removeItem("sessionTimedOut");
    const restoreBrowserState = primePrivacyNoticeAccepted();

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
          access: sessionUser.access,
          expires: shouldConfirmExpiringSession ? nearExpiry : initialExpiry,
        });
      }

      if (url.pathname === "/api/v1/session" && request.method === "POST") {
        return jsonResponse({
          user: sessionUser,
          access: sessionUser.access,
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
      cleanupMountedApp({ container, dispose, restoreFetch, restoreBrowserState });
    }
  });

  await t.test("skips warning when server expiry was rolled forward", async () => {
    sessionStorage.removeItem("sessionTimedOut");
    const restoreBrowserState = primePrivacyNoticeAccepted();

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
          access: sessionUser.access,
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
      cleanupMountedApp({ container, dispose, restoreFetch, restoreBrowserState });
    }
  });
});
