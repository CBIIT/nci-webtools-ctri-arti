import assert from "/test/assert.js";
import { installMockFetch, jsonResponse, mountApp, waitForElement } from "/test/helpers.js";
import test from "/test/test.js";
import { clearCachedData } from "/utils/static-data.js";

const ADMIN_ACCESS = { "*": { "*": true } };
const sessionUser = {
  id: 1,
  email: "integration@example.org",
  firstName: "Integration",
  lastName: "Tester",
  Role: { id: 1, name: "admin" },
  access: ADMIN_ACCESS,
};

function primeAuthenticatedBrowserState() {
  clearCachedData();
  document.cookie = "privacyNoticeAccepted=true; path=/";

  return () => {
    clearCachedData();
    document.cookie = "privacyNoticeAccepted=; max-age=0; path=/";
  };
}

test("Chat-V2 model selector uses /model/list", async () => {
  let requestedType = null;
  const restoreBrowserState = primeAuthenticatedBrowserState();

  const restoreFetch = installMockFetch(async ({ url, request }) => {
    if (url.pathname === "/api/v1/session") {
      return jsonResponse({ user: sessionUser, access: sessionUser.access });
    }

    if (url.pathname === "/api/config") {
      return jsonResponse({});
    }

    if (url.pathname === "/api/v1/agents" && request.method === "GET") {
      return jsonResponse([
        { id: 1, name: "Research Agent", visible: true },
        { id: 2, name: "Protocol Advisor", visible: false },
      ]);
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

    if (url.pathname === "/api/v1/model/list" && request.method === "GET") {
      requestedType = url.searchParams.get("type");
      return jsonResponse([
        {
          name: "Sonnet 4.6",
          internalName: "us.anthropic.claude-sonnet-4-6",
          type: "chat",
          providerName: "bedrock",
        },
        {
          name: "Opus 4.6",
          internalName: "us.anthropic.claude-opus-4-6-v1",
          type: "chat",
          providerName: "bedrock",
        },
        {
          name: "Sonnet 4.6 (via IDP)",
          internalName: "databricks-claude-sonnet-4-6",
          type: "chat",
          providerName: "databricks",
        },
        {
          name: "Opus 4.6 (via IDP)",
          internalName: "databricks-claude-opus-4-6",
          type: "chat",
          providerName: "databricks",
        },
      ]);
    }

    return null;
  });

  const { container, errors, dispose } = mountApp("/tools/chat-v2?agentId=1");

  try {
    await waitForElement(container, "option", (el) => el.value === "databricks-claude-sonnet-4-6");

    const modelSelect = await waitForElement(container, "#model");
    const groups = Array.from(modelSelect.querySelectorAll("optgroup")).map((group) => ({
      label: group.label,
      options: Array.from(group.querySelectorAll("option")).map((option) => ({
        value: option.value,
        label: option.textContent.trim(),
      })),
    }));
    const options = groups.flatMap((group) => group.options);

    assert.strictEqual(requestedType, "chat", "chat-v2 should request chat models");
    assert.deepStrictEqual(
      groups.map((group) => group.label),
      ["Bedrock", "Databricks"],
      "chat-v2 should render Bedrock and Databricks optgroups"
    );
    assert.ok(
      options.some((option) => option.value === "databricks-claude-sonnet-4-6"),
      "chat-v2 should surface Databricks Sonnet"
    );
    assert.ok(
      options.some((option) => option.value === "databricks-claude-opus-4-6"),
      "chat-v2 should surface Databricks Opus"
    );
    assert.ok(
      options.some((option) => option.label === "Sonnet 4.6 (via IDP)"),
      "chat-v2 should use the gateway model names for Databricks labels"
    );
    assert.strictEqual(
      modelSelect.value,
      "us.anthropic.claude-sonnet-4-6",
      "chat-v2 should keep the agent's current model selected"
    );
    assert.ok(
      !container.textContent.includes("Protocol Advisor"),
      "chat-v2 should keep hidden agents out of the picker UI"
    );
    assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((error) => error.message)}`);
  } finally {
    restoreBrowserState();
    restoreFetch();
    dispose();
    if (container.parentNode === document.body) {
      document.body.removeChild(container);
    }
  }
});
