import assert from "/test/assert.js";
import {
  cleanupMountedApp,
  installMockFetch,
  jsonResponse,
  mountApp,
  ndjsonResponse,
  primePrivacyNoticeAccepted,
  waitForCondition,
  waitForElement,
} from "/test/helpers.js";
import test from "/test/test.js";

import { clearCachedData } from "../../../../utils/static-data.js";

const ADMIN_ACCESS = { "*": { "*": true } };
const sessionUser = {
  id: 1,
  email: "integration@example.org",
  firstName: "Integration",
  lastName: "Tester",
  Role: { id: 1, name: "admin" },
  access: ADMIN_ACCESS,
};

test("Chat-V2 E2E: Send Message", async () => {
  let createConversationBody = null;
  let chatBody = null;
  let titleUpdated = false;
  let conversationsReloaded = false;

  const restoreBrowserState = primePrivacyNoticeAccepted(() => clearCachedData());
  const restoreFetch = installMockFetch(async ({ url, request }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({ user: sessionUser, access: sessionUser.access });
    }

    if (url.pathname === "/api/config") {
      return jsonResponse({});
    }

    if (url.pathname === "/api/v1/log" && request.method === "POST") {
      return jsonResponse({ ok: true });
    }

    if (url.pathname === "/api/v1/agents" && request.method === "GET") {
      return jsonResponse([{ id: 1, name: "Research Agent", visible: true }]);
    }

    if (url.pathname === "/api/v1/agents/1" && request.method === "GET") {
      return jsonResponse({
        id: 1,
        name: "Research Agent",
        runtime: { model: "us.anthropic.claude-sonnet-4-6" },
      });
    }

    if (url.pathname === "/api/v1/conversations" && request.method === "GET") {
      if (titleUpdated) {
        conversationsReloaded = true;
      }
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v1/conversations" && request.method === "POST") {
      createConversationBody = await request.clone().json();
      return jsonResponse({ id: 101, title: "Untitled" }, { status: 201 });
    }

    if (url.pathname === "/api/v1/conversations/101/messages" && request.method === "GET") {
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v1/conversations/101" && request.method === "GET") {
      return jsonResponse({ id: 101, title: "Untitled" });
    }

    if (url.pathname === "/api/v1/conversations/101" && request.method === "PUT") {
      titleUpdated = true;
      const body = await request.clone().json();
      return jsonResponse({ id: 101, title: body.title || "Test Title" });
    }

    if (url.pathname === "/api/v1/model/list" && request.method === "GET") {
      return jsonResponse([
        {
          name: "Sonnet 4.6",
          internalName: "us.anthropic.claude-sonnet-4-6",
          type: "chat",
          providerName: "bedrock",
        },
        {
          name: "Sonnet 4.6 (via IDP)",
          internalName: "databricks-claude-sonnet-4-6",
          type: "chat",
          providerName: "databricks",
        },
      ]);
    }

    if (url.pathname === "/api/v1/model/invoke" && request.method === "POST") {
      return jsonResponse({
        output: {
          message: {
            role: "assistant",
            content: [{ text: "Research Summary" }],
          },
        },
      });
    }

    if (url.pathname === "/api/v1/agents/1/conversations/101/chat" && request.method === "POST") {
      chatBody = await request.clone().json();
      return ndjsonResponse([
        { messageStart: { role: "assistant" } },
        { contentBlockStart: { contentBlockIndex: 0, start: { text: {} } } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Four" } } },
        { contentBlockStop: { contentBlockIndex: 0 } },
        { messageStop: { stopReason: "end_turn" } },
      ]);
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
    const modelSelect = await waitForElement(container, "#model", 5000);
    const reasoningToggle = await waitForElement(container, "#reasoningMode", 5000);

    modelSelect.value = "databricks-claude-sonnet-4-6";
    modelSelect.dispatchEvent(new Event("input", { bubbles: true }));

    reasoningToggle.checked = true;
    reasoningToggle.dispatchEvent(new Event("input", { bubbles: true }));

    textarea.value = "What is 2+2? Answer in one word.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    sendButton.click();

    const assistantBubble = await waitForElement(
      container,
      '[data-chat-message="true"][data-role="assistant"]',
      (el) => el.textContent.includes("Four"),
      5000
    );
    assert.ok(assistantBubble, "expected the streamed assistant response to render");

    await waitForCondition(() => Boolean(chatBody), 5000, "chat-v2 chat request");

    assert.deepStrictEqual(createConversationBody, {
      title: "Untitled",
      agentId: 1,
    });
    assert.strictEqual(
      chatBody?.message?.content?.[0]?.text,
      "What is 2+2? Answer in one word.",
      "chat-v2 should send the current draft text"
    );
    assert.strictEqual(
      chatBody?.modelOverride,
      "databricks-claude-sonnet-4-6",
      "chat-v2 should send the admin model override on first submit"
    );
    assert.strictEqual(
      chatBody?.thoughtBudget,
      32000,
      "chat-v2 should send the deep-research thought budget on first submit"
    );
    await waitForCondition(
      () => titleUpdated && conversationsReloaded,
      1000,
      "chat-v2 title update"
    );
    assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((error) => error?.message)}`);
  } finally {
    cleanupMountedApp({ container, dispose, restoreFetch, restoreBrowserState });
  }
});
