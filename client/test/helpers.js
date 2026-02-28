import { MemoryRouter, createMemoryHistory } from "@solidjs/router";
import { ErrorBoundary } from "solid-js";
import html from "solid-js/html";
import { render } from "solid-js/web";

import { AuthProvider } from "../contexts/auth-context.js";
import Layout from "../pages/layout.js";
import getRoutes from "../pages/routes.js";

/**
 * Mount a full app instance at a given route.
 * Captures page errors via outer ErrorBoundary and global listeners,
 * console.error-ing them so Playwright's pageerror/console handlers see them.
 * Returns { container, errors, dispose }.
 */
export function mountApp(initialUrl) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const errors = [];

  const onError = (e) => {
    errors.push(e.error || e);
    console.error(`Page error on ${initialUrl}:`, e.error || e);
  };
  const onRejection = (e) => {
    errors.push(e.reason);
    console.error(`Unhandled rejection on ${initialUrl}:`, e.reason);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const history = createMemoryHistory();
  history.set({ value: initialUrl });
  const _dispose = render(
    () =>
      html` <${ErrorBoundary}
        fallback=${(err) => {
          errors.push(err);
          console.error(`Page error on ${initialUrl}:`, err);
          return null;
        }}
      >
        <${AuthProvider}>
          ${() => html`<${MemoryRouter} history=${history} root=${Layout}>${getRoutes()}<//>`}
        <//>
      <//>`,
    container
  );

  return {
    container,
    errors,
    dispose() {
      _dispose();
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    },
  };
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
