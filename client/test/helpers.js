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
  window.__recordTestMount?.(initialUrl);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const errors = [];
  const originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

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
  window.history.replaceState({}, "", initialUrl);
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
      window.history.replaceState({}, "", originalUrl);
    },
  };
}

export function jsonResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function ndjsonResponse(events, init = {}) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
        controller.close();
      },
    }),
    {
      ...init,
      headers: {
        "Content-Type": "application/x-ndjson",
        ...(init.headers || {}),
      },
    }
  );
}

export function getTestApiKey() {
  return new URLSearchParams(window.location.search).get("apiKey");
}

export function createApiHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };
  const apiKey = getTestApiKey();
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

export async function apiJson(method, path, body, { headers: extraHeaders } = {}) {
  const options = {
    method,
    headers: createApiHeaders(extraHeaders),
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`/api/v1${path}`, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, json, res };
}

export function installMockFetch(handler) {
  const previousFetch = window.fetch;
  const originalFetch = previousFetch.bind(window);
  const mockFetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url, window.location.origin);
    const mockedResponse = await handler({
      request,
      url,
      originalFetch,
    });

    if (mockedResponse) {
      return mockedResponse;
    }

    return originalFetch(request);
  };
  window.fetch = mockFetch;

  return () => {
    // Only restore if this wrapper is still active so the common nested-mock
    // case does not clobber a newer fetch wrapper.
    if (window.fetch === mockFetch) {
      window.fetch = previousFetch;
    }
  };
}

export function primePrivacyNoticeAccepted(reset) {
  reset?.();
  document.cookie = "privacyNoticeAccepted=true; path=/";

  return () => {
    reset?.();
    document.cookie = "privacyNoticeAccepted=; max-age=0; path=/";
  };
}

export function cleanupMountedApp({ container, dispose, restoreFetch, restoreBrowserState } = {}) {
  dispose?.();
  restoreFetch?.();
  restoreBrowserState?.();
  if (container?.parentNode === document.body) {
    document.body.removeChild(container);
  }
}

export function waitForCondition(predicate, timeoutMs = 5000, label = "condition") {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    (function check() {
      try {
        const value = predicate();
        if (value) {
          window.__recordTestWait?.("condition", label, performance.now() - start, true);
          return resolve(value);
        }
      } catch (error) {
        window.__recordTestWait?.("condition", label, performance.now() - start, false);
        return reject(error);
      }

      if (performance.now() - start > timeoutMs) {
        window.__recordTestWait?.("condition", label, performance.now() - start, false);
        return reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`));
      }
      requestAnimationFrame(check);
    })();
  });
}

export function waitForNetworkIdle(idleMs = 50, timeoutMs = 5000) {
  return waitForCondition(
    () => {
      const network = window.__TEST_NETWORK__ || window.__TEST_METRICS__?.network;
      if (!network) return true;
      return network.pending === 0 && performance.now() - network.lastActivity >= idleMs;
    },
    timeoutMs,
    `network idle (${idleMs}ms)`
  );
}

/** Poll until a DOM element matching selector+predicate appears inside container. */
export function waitForElement(container, selector, predicate, timeoutMs = 10000) {
  if (typeof predicate === "number") {
    timeoutMs = predicate;
    predicate = undefined;
  }
  return new Promise((resolve, reject) => {
    const start = performance.now();
    (function check() {
      const els = container.querySelectorAll(selector);
      for (const el of els) {
        if (!predicate || predicate(el)) {
          window.__recordTestWait?.("element", selector, performance.now() - start, true);
          return resolve(el);
        }
      }
      if (performance.now() - start > timeoutMs) {
        window.__recordTestWait?.("element", selector, performance.now() - start, false);
        return reject(new Error(`Timed out waiting for "${selector}" after ${timeoutMs}ms`));
      }
      requestAnimationFrame(check);
    })();
  });
}
