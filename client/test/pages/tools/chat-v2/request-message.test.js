import assert from "/test/assert.js";
import test from "/test/test.js";

import { getAgentRequestMessage } from "../../../../pages/tools/chat-v2/hooks.js";

test("Chat-V2 sends the explicit request message instead of reusing the last rendered message", () => {
  const assistantToolUseMessage = {
    role: "assistant",
    content: [{ toolUse: { toolUseId: "tu_1", name: "search", input: { query: "nci" } } }],
  };
  const explicitUserMessage = {
    role: "user",
    content: [{ text: "Tell me about NCI." }],
  };

  const result = getAgentRequestMessage(
    { messages: [assistantToolUseMessage] },
    explicitUserMessage
  );

  assert.strictEqual(result, explicitUserMessage);
  assert.ok(
    !result.content.some((block) => block.toolUse),
    "request message should not inherit toolUse"
  );
});

test("Chat-V2 can still fall back to the latest stored message for continuation turns", () => {
  const toolResultsMessage = {
    role: "user",
    content: [
      { toolResult: { toolUseId: "tu_1", content: [{ json: { results: { ok: true } } }] } },
    ],
  };

  const result = getAgentRequestMessage({ messages: [toolResultsMessage] });

  assert.strictEqual(result, toolResultsMessage);
  assert.ok(
    result.content.some((block) => block.toolResult),
    "continuation turns should keep tool results"
  );
});
