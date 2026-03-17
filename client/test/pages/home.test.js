import assert from "../assert.js";
import { installMockFetch, jsonResponse, mountApp, waitForCondition, waitForElement } from "../helpers.js";
import test from "../test.js";

test("Home Page Tests", async (t) => {
  const restoreFetch = installMockFetch(({ url }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({
        user: {
          id: 1,
          email: "integration@example.org",
          firstName: "Integration",
          lastName: "Tester",
          Role: { id: 1, name: "admin" },
        },
      });
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
