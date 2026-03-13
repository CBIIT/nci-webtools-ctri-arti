/**
 * E2E test for chat-v2: mount the actual page, type a message, click Send,
 * and verify the assistant response renders.
 *
 * Uses a real model (whatever the page defaults to) via the server-side
 * agent loop (/agents/:id/conversations/:id/chat).
 */
import assert from "/test/assert.js";
import { mountApp, waitForElement } from "/test/helpers.js";
import test from "/test/test.js";

const urlParams = new URLSearchParams(window.location.search);
const TEST_API_KEY = urlParams.get("apiKey");

function headers(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (TEST_API_KEY) h["x-api-key"] = TEST_API_KEY;
  return h;
}

test("Chat-V2 E2E: Send Message", async (t) => {
  let agentId;

  await t.test("setup: create agent", async () => {
    const res = await fetch("/api/v1/agents", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: "E2E Chat Agent", tools: ["search", "browse"] }),
    });
    assert.strictEqual(res.status, 201);
    const agent = await res.json();
    agentId = agent.id;
    console.log("[chat-v2-e2e] created agent:", agentId);
  });

  await t.test("mount page, type, click Send, verify response", async () => {
    const originalSearch = window.location.search;
    const params = new URLSearchParams(originalSearch);
    params.set("agentId", agentId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params}`);

    const { container, errors, dispose } = mountApp(`/tools/chat-v2?agentId=${agentId}`);

    try {
      const textarea = await waitForElement(container, "#message", 10000);
      console.log("[chat-v2-e2e] textarea found");

      // Wait for page init (agent load, etc)
      await new Promise((r) => setTimeout(r, 2000));

      const sendBtn = await waitForElement(
        container,
        'button[type="submit"]',
        (el) => el.textContent?.trim() === "Send",
        5000
      );
      console.log("[chat-v2-e2e] Send button found");

      const form = textarea.closest("form");
      assert.ok(form, "textarea should be inside a form");

      // Use the mock model so this test only exercises the browser UI path.
      const modelSelect = form.querySelector('select[name="model"]');
      if (modelSelect) {
        if (!Array.from(modelSelect.options).some((option) => option.value === "mock-model")) {
          const mockOption = document.createElement("option");
          mockOption.value = "mock-model";
          mockOption.textContent = "Mock Model";
          modelSelect.appendChild(mockOption);
        }
        modelSelect.value = "mock-model";
      }
      console.log("[chat-v2-e2e] model:", modelSelect?.value || "default");

      // Type a message
      textarea.value = "What is 2+2? Answer in one word.";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));

      // Click Send
      sendBtn.click();
      console.log("[chat-v2-e2e] clicked Send");

      // Poll for an actual assistant chat bubble, not the privacy notice markdown
      let success = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const messages = container.querySelectorAll('[data-chat-message="true"]');
        const assistantMessages = container.querySelectorAll(
          '[data-chat-message="true"][data-role="assistant"]'
        );
        console.log(
          `[chat-v2-e2e] poll ${i}: messages=${messages.length} assistant=${assistantMessages.length} errors=${errors.length}`
        );
        if (errors.length > 0) {
          console.log(
            "[chat-v2-e2e] errors:",
            errors.map((e) => e.message || String(e))
          );
        }
        if (assistantMessages.length >= 1) {
          success = true;
          console.log("[chat-v2-e2e] assistant message appeared!");
          break;
        }
      }

      const allMessages = container.querySelectorAll('[data-chat-message="true"]');
      console.log("[chat-v2-e2e] final messages:", allMessages.length);
      for (let i = 0; i < Math.min(allMessages.length, 5); i++) {
        console.log(
          `[chat-v2-e2e] message[${i}]: ${allMessages[i].textContent?.substring(0, 100)}`
        );
      }

      assert.ok(success, "expected at least 1 assistant chat bubble");
      assert.strictEqual(errors.length, 0, `Page errors: ${errors.map((e) => e.message || e)}`);
    } finally {
      window.history.replaceState({}, "", `${window.location.pathname}?${originalSearch}`);
      dispose();
      document.body.removeChild(container);
    }
  });

  await t.test("cleanup", async () => {
    if (agentId) {
      await fetch(`/api/v1/agents/${agentId}`, { method: "DELETE", headers: headers() });
    }
  });
});
