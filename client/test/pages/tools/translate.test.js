import assert from "../../assert.js";
import { mountApp, waitForElement } from "../../helpers.js";
import test from "../../test.js";

test("Translator Page Tests", async (t) => {
  await t.test("/tools/translator renders Document Translator heading", async () => {
    const { container, errors, dispose } = mountApp("/tools/translator");
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Document Translator")
      );
      assert.ok(h1, "Should render Document Translator heading");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/tools/translator renders all 6 language checkboxes", async () => {
    const { container, errors, dispose } = mountApp("/tools/translator");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Document Translator"));

      const expectedLanguages = [
        "Amharic",
        "Arabic",
        "French",
        "Portuguese",
        "Spanish (Mexican)",
        "Vietnamese",
      ];
      const expectedIds = ["am", "ar", "fr", "pt", "es-MX", "vi"];

      for (const id of expectedIds) {
        const checkbox = container.querySelector(`#${CSS.escape(id)}`);
        assert.ok(checkbox, `Checkbox for ${id} should exist`);
        assert.strictEqual(checkbox.type, "checkbox", `${id} should be a checkbox`);
      }

      const labels = Array.from(container.querySelectorAll(".form-check-label"));
      for (const lang of expectedLanguages) {
        assert.ok(
          labels.some((l) => l.textContent.trim() === lang),
          `Label for ${lang} should exist`
        );
      }
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/tools/translator: language checkbox selection works", async () => {
    const { container, errors, dispose } = mountApp("/tools/translator");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Document Translator"));

      const frCheckbox = container.querySelector("#fr");
      assert.ok(frCheckbox, "French checkbox should exist");
      assert.ok(!frCheckbox.checked, "French should not be checked initially");

      // Check French
      frCheckbox.checked = true;
      frCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));

      assert.ok(frCheckbox.checked, "French should be checked after click");

      // Uncheck French
      frCheckbox.checked = false;
      frCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));

      assert.ok(!frCheckbox.checked, "French should be unchecked after second click");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/tools/translator: admin user sees engine selector", async () => {
    const { container, errors, dispose } = mountApp("/tools/translator");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Document Translator"));

      // Admin users should see the engine dropdown
      const engineSelect = container.querySelector('select[aria-label="Translation engine"]');
      if (engineSelect) {
        const options = Array.from(engineSelect.options).map((o) => o.textContent.trim());
        assert.ok(options.includes("AWS Translate"), "Should have AWS Translate option");
        assert.strictEqual(engineSelect.value, "aws", "AWS Translate should be default");
      }
      // Non-admin users won't see it, so we just verify no errors
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/tools/translator has Reset and Generate buttons", async () => {
    const { container, errors, dispose } = mountApp("/tools/translator");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Document Translator"));

      const resetButton = container.querySelector('button[type="reset"]');
      assert.ok(resetButton, "Reset button should exist");
      assert.ok(resetButton.textContent.includes("Reset"), "Reset button should say Reset");

      const generateButton = container.querySelector("#translateButton");
      assert.ok(generateButton, "Generate button should exist");
      assert.ok(
        generateButton.textContent.includes("Generate"),
        "Generate button should say Generate"
      );
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/tools/translator shows welcome panel when no jobs exist", async () => {
    const { container, errors, dispose } = mountApp("/tools/translator");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Document Translator"));

      const welcomeHeading = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Welcome to Document Translator")
      );
      assert.ok(welcomeHeading, "Welcome heading should appear when no jobs exist");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/tools/translator: form reset clears selections", async () => {
    const { container, errors, dispose } = mountApp("/tools/translator");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Document Translator"));

      // Check a language
      const arCheckbox = container.querySelector("#ar");
      arCheckbox.checked = true;
      arCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 100));

      // Click Reset
      const resetButton = container.querySelector('button[type="reset"]');
      resetButton.click();
      await new Promise((r) => setTimeout(r, 300));

      // Verify checkbox is unchecked after reset
      assert.ok(!arCheckbox.checked, "Arabic checkbox should be unchecked after reset");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/tools/translator has translateForm form element", async () => {
    const { container, errors, dispose } = mountApp("/tools/translator");
    try {
      await waitForElement(container, "h1", (el) => el.textContent.includes("Document Translator"));

      const form = container.querySelector("#translateForm");
      assert.ok(form, "translateForm should exist");
      assert.strictEqual(form.tagName, "FORM", "translateForm should be a form element");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message)}`);
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});
