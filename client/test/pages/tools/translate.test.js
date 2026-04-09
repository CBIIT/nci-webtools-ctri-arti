import { clearCachedData } from "../../../utils/static-data.js";
import assert from "../../assert.js";
import {
  cleanupMountedApp,
  installMockFetch,
  jsonResponse,
  mountApp,
  primePrivacyNoticeAccepted,
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
const translationLanguages = [
  { id: "am", label: "Amharic" },
  { id: "ar", label: "Arabic" },
  { id: "fr", label: "French" },
  { id: "pt", label: "Portuguese" },
  { id: "es-MX", label: "Spanish (Mexican)" },
  { id: "vi", label: "Vietnamese" },
];

test("Translator Page Tests", async (t) => {
  const restoreBrowserState = primePrivacyNoticeAccepted(() => clearCachedData());
  const restoreFetch = installMockFetch(({ url }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({ user: sessionUser, access: sessionUser.access });
    }
    if (url.pathname === "/api/config") {
      return jsonResponse({});
    }
    return null;
  });

  const { container, errors, dispose } = mountApp("/tools/translator");

  try {
    await waitForElement(container, "h1", (el) => el.textContent.includes("Document Translator"));

    await t.test("/tools/translator renders Document Translator heading", async () => {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Document Translator")
      );
      assert.ok(h1, "Should render Document Translator heading");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/tools/translator renders all 6 language checkboxes", async () => {
      const labels = Array.from(container.querySelectorAll(".form-check-label")).map((label) =>
        label.textContent.trim()
      );

      for (const language of translationLanguages) {
        const checkbox = container.querySelector(`#${CSS.escape(language.id)}`);
        assert.ok(checkbox, `Checkbox for ${language.id} should exist`);
        assert.strictEqual(checkbox.type, "checkbox", `${language.id} should be a checkbox`);
        assert.ok(labels.includes(language.label), `Label for ${language.label} should exist`);
      }
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/tools/translator: language checkbox selection works", async () => {
      const frCheckbox = container.querySelector("#fr");
      assert.ok(frCheckbox, "French checkbox should exist");
      assert.ok(!frCheckbox.checked, "French should not be checked initially");

      frCheckbox.checked = true;
      frCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForCondition(() => frCheckbox.checked, 1000, "translator checkbox checked");

      assert.ok(frCheckbox.checked, "French should be checked after click");

      frCheckbox.checked = false;
      frCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForCondition(() => !frCheckbox.checked, 1000, "translator checkbox unchecked");

      assert.ok(!frCheckbox.checked, "French should be unchecked after second click");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/tools/translator: admin user sees engine selector", async () => {
      const engineSelect = container.querySelector('select[aria-label="Translation engine"]');
      assert.ok(engineSelect, "Admin users should see the translation engine selector");

      const options = Array.from(engineSelect.options).map((o) => o.textContent.trim());
      assert.ok(options.includes("AWS Translate"), "Should have AWS Translate option");
      assert.strictEqual(engineSelect.value, "aws", "AWS Translate should be default");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/tools/translator has Reset and Generate buttons", async () => {
      const resetButton = container.querySelector('button[type="reset"]');
      assert.ok(resetButton, "Reset button should exist");

      const generateButton = container.querySelector("#translateButton");
      assert.ok(generateButton, "Generate button should exist");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/tools/translator shows welcome panel when no jobs exist", async () => {
      const welcomeHeading = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Welcome to Document Translator")
      );
      assert.ok(welcomeHeading, "Welcome heading should appear when no jobs exist");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/tools/translator: form reset clears selections", async () => {
      const arCheckbox = container.querySelector("#ar");
      arCheckbox.checked = true;
      arCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForCondition(() => arCheckbox.checked, 1000, "translator reset precondition");

      const resetButton = container.querySelector('button[type="reset"]');
      resetButton.click();
      await waitForCondition(() => !arCheckbox.checked, 1000, "translator form reset");

      assert.ok(!arCheckbox.checked, "Arabic checkbox should be unchecked after reset");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });

    await t.test("/tools/translator has translateForm form element", async () => {
      const form = container.querySelector("#translateForm");
      assert.ok(form, "translateForm should exist");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    });
  } finally {
    cleanupMountedApp({ container, dispose, restoreFetch, restoreBrowserState });
  }
});

test("Translator request form visibility follows role", async (t) => {
  await t.test("admin does not see the Spanish translation request text", async () => {
    clearCachedData();
    const restoreBrowserState = primePrivacyNoticeAccepted(() => clearCachedData());
    const restoreFetch = installMockFetch(({ url }) => {
      if (url.pathname === "/api/v1/session") {
        return jsonResponse({ user: sessionUser, access: sessionUser.access });
      }
      if (url.pathname === "/api/config") {
        return jsonResponse({});
      }
      return null;
    });

    const { container, errors, dispose } = mountApp("/tools/translator");

    try {
      await waitForCondition(
        () => window.__authContext?.().status() === "LOADED",
        5000,
        "translator auth loaded for admin"
      );

      assert.ok(
        !container.textContent.includes("Request Consent Spanish Translation"),
        "Admin users should not see the Spanish request text"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      cleanupMountedApp({ container, dispose, restoreFetch, restoreBrowserState });
    }
  });

  await t.test("normal users do see the Spanish translation request text", async () => {
    clearCachedData();
    const restoreBrowserState = primePrivacyNoticeAccepted(() => clearCachedData());
    const restoreFetch = installMockFetch(({ url }) => {
      if (url.pathname === "/api/v1/session") {
        return jsonResponse({
          user: {
            id: 2,
            email: "user@example.org",
            firstName: "Normal",
            lastName: "User",
            Role: { id: 3, name: "user" },
            access: { "/tools/translator": { view: true } },
          },
          access: { "/tools/translator": { view: true } },
        });
      }
      if (url.pathname === "/api/config") {
        return jsonResponse({});
      }
      return null;
    });

    const { container, errors, dispose } = mountApp("/tools/translator");

    try {
      await waitForCondition(
        () => window.__authContext?.().status() === "LOADED",
        5000,
        "translator auth loaded for normal user"
      );

      assert.ok(
        container.textContent.includes("Request Consent Spanish Translation"),
        "Normal users should see the Spanish request text"
      );
      assert.ok(
        container.textContent.includes("Spanish Translation Request Form"),
        "Normal users should see the request form link text"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      cleanupMountedApp({ container, dispose, restoreFetch, restoreBrowserState });
    }
  });
});
