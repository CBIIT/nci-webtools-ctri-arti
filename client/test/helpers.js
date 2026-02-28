import { MemoryRouter, createMemoryHistory } from "@solidjs/router";
import html from "solid-js/html";
import { render } from "solid-js/web";

import { AuthProvider } from "../contexts/auth-context.js";
import Layout from "../pages/layout.js";
import getRoutes from "../pages/routes.js";

/** Mount a full app instance at a given route. Returns { container, dispose }. */
export function mountApp(initialUrl) {
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
export function waitForElement(container, selector, predicate, timeoutMs = 10000) {
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
