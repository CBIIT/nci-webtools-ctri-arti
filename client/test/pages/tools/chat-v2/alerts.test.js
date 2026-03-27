import assert from "/test/assert.js";
import { AUTH_STATE_STORAGE_KEY } from "/contexts/auth-context.js";
import { installMockFetch, jsonResponse, mountApp, waitForElement } from "/test/helpers.js";
import test from "/test/test.js";

import { clearAllAlerts } from "../../../../utils/alerts.js";
import { clearCachedData } from "../../../../utils/static-data.js";

const SUPER_USER_ACCESS = {
  "/tools/chat": { view: true },
  "/tools/chat-v2": { view: true },
};

const LIMIT_MESSAGE =
  "You have reached your allocated usage limit. Your access to the chat tool is temporarily " +
  "disabled and will reset tomorrow at 12:00 AM. If you need assistance or believe this is an " +
  "error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.";

const sessionUser = {
  id: 1,
  email: "integration@example.org",
  firstName: "Integration",
  lastName: "Tester",
  Role: { id: 2, name: "user" },
  access: SUPER_USER_ACCESS,
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

test("Chat-V2 shows an alert when the server rejects chat with a usage-limit error", async () => {
  clearAllAlerts();
  const restoreBrowserState = primeAuthenticatedBrowserState();

  const restoreFetch = installMockFetch(async ({ url, request }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({ user: sessionUser });
    }

    if (url.pathname === "/api/config") {
      return jsonResponse({});
    }

    if (url.pathname === "/api/v1/agents" && request.method === "GET") {
      return jsonResponse([{ id: 1, name: "Research Agent" }]);
    }

    if (url.pathname === "/api/v1/agents/1" && request.method === "GET") {
      return jsonResponse({
        id: 1,
        name: "Research Agent",
        runtime: { model: "us.anthropic.claude-sonnet-4-6" },
      });
    }

    if (url.pathname === "/api/v1/conversations" && request.method === "GET") {
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v1/conversations" && request.method === "POST") {
      return jsonResponse({ id: 101, title: "Untitled" }, { status: 201 });
    }

    if (url.pathname === "/api/v1/conversations/101/messages" && request.method === "GET") {
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v1/conversations/101" && request.method === "GET") {
      return jsonResponse({ id: 101, title: "Untitled" });
    }

    if (url.pathname === "/api/v1/model/list" && request.method === "GET") {
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v1/agents/1/conversations/101/chat" && request.method === "POST") {
      return jsonResponse({ error: LIMIT_MESSAGE }, { status: 429 });
    }

    return null;
  });

  const { container, errors, dispose } = mountApp("/tools/chat-v2?agentId=1");

  try {
    const textarea = await waitForElement(container, "#message", 10000);
    const sendButton = await waitForElement(
      container,
      'button[type="submit"]',
      (el) => el.textContent?.trim() === "Send",
      5000
    );

    textarea.value = "Please explain my usage limit.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    sendButton.click();

    const alert = await waitForElement(
      container,
      ".alert-danger",
      (el) => el.textContent.includes(LIMIT_MESSAGE),
      5000
    );

    assert.ok(alert, "expected the usage-limit alert to render");
    assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((error) => error?.message)}`);
  } finally {
    clearAllAlerts();
    restoreBrowserState();
    restoreFetch();
    dispose();
    if (container.parentNode === document.body) {
      document.body.removeChild(container);
    }
  }
});
