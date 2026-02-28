import { MemoryRouter, createMemoryHistory } from "@solidjs/router";
import html from "solid-js/html";
import { render } from "solid-js/web";

import { AuthProvider } from "../../contexts/auth-context.js";
import Layout from "../../pages/layout.js";
import getRoutes from "../../pages/routes.js";
import assert from "../assert.js";
import test from "../test.js";

/** Mount a full app instance at a given route. Returns { container, dispose }. */
function mountApp(initialUrl) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const history = createMemoryHistory();
  history.set({ value: initialUrl });
  const dispose = render(
    () =>
      html` <${AuthProvider}>
        ${() => html`<${MemoryRouter} history=${history} root=${Layout}>${getRoutes()}<//>`}
      <//>`,
    container
  );
  return { container, dispose };
}

/** Poll until a DOM element matching selector+predicate appears inside container. */
function waitForElement(container, selector, predicate, timeoutMs = 10000) {
  if (typeof predicate === "number") {
    timeoutMs = predicate;
    predicate = undefined;
  }
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      const els = container.querySelectorAll(selector);
      for (const el of els) {
        if (!predicate || predicate(el)) return resolve(el);
      }
      if (Date.now() - start > timeoutMs)
        return reject(new Error(`Timed out waiting for "${selector}" after ${timeoutMs}ms`));
      requestAnimationFrame(check);
    })();
  });
}

test("Admin Page Tests", async (t) => {
  await t.test("/_/users renders Manage Users page", async () => {
    const { container, dispose } = mountApp("/_/users");
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("Manage Users")
      );
      assert.ok(h1, "Should render Manage Users heading");
      const table = await waitForElement(container, "table");
      assert.ok(table, "Should render a data table");
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("/_/usage renders AI Usage Dashboard page", async () => {
    const { container, dispose } = mountApp("/_/usage");
    try {
      const h1 = await waitForElement(container, "h1", (el) =>
        el.textContent.includes("AI Usage Dashboard")
      );
      assert.ok(h1, "Should render AI Usage Dashboard heading");
      const table = await waitForElement(container, "table");
      assert.ok(table, "Should render a data table");
    } finally {
      dispose();
      document.body.removeChild(container);
    }
  });
});
