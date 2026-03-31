/**
 * E2E tests for the server-side agent loop.
 *
 * Exercises the full chat-v2 path:
 *   API calls → /agents/:id/conversations/:id/chat → agents loop → gateway → tool execution → NDJSON stream
 *
 * These tests mirror what the actual chat-v2 UI does:
 *   1. Create an agent with tools (like the admin/config flow)
 *   2. Create a conversation (like clicking "New Chat")
 *   3. POST a message to the agent chat endpoint (like clicking "Send")
 *   4. Parse the NDJSON stream (like runAgentServer/streamResponse in hooks.js)
 *   5. Verify tool loop, message persistence, and multi-turn context
 *
 * Uses scripted-model for deterministic testing + real tool execution.
 * Runs in-browser during integration tests via ?test=1&apiKey=...
 */
import assert from "/test/assert.js";
import { apiJson as api, createApiHeaders } from "/test/helpers.js";
import test from "/test/test.js";

const SCRIPTED_MODEL = "scripted-model";
const SCRIPTED_TOOL_USE_ID = "scripted_tool_1";

function scriptedToolUse(name, input, toolUseId = SCRIPTED_TOOL_USE_ID) {
  return JSON.stringify({
    toolUse: {
      toolUseId,
      name,
      input,
    },
  });
}

/**
 * Parse NDJSON stream exactly like hooks.js streamResponse() does.
 * Returns array of parsed events.
 */
async function readNdjsonStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        try {
          events.push(JSON.parse(line));
        } catch {
          // skip
        }
      }
    }
  }
  if (buffer.trim()) {
    try {
      events.push(JSON.parse(buffer));
    } catch {
      // skip
    }
  }
  return events;
}

/**
 * Simulate what chat-v2 hooks.js runAgentServer() does:
 * POST to /agents/:id/conversations/:id/chat, then stream-parse NDJSON.
 */
async function sendChatMessage(agentId, conversationId, text, model = SCRIPTED_MODEL) {
  const response = await fetch(`/api/v1/agents/${agentId}/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: createApiHeaders(),
    body: JSON.stringify({
      message: { role: "user", content: [{ text }] },
      model,
      thoughtBudget: 0,
    }),
  });
  const events = await readNdjsonStream(response);
  return { response, events };
}

/**
 * Reconstruct messages from NDJSON events the way hooks.js does.
 * This mirrors processContentBlock + runAgentServer logic.
 */
function reconstructMessagesFromEvents(events) {
  const messages = [];
  let current = null;

  for (const event of events) {
    if (event.messageStart) {
      current = { role: event.messageStart.role, content: [] };
      messages.push(current);
    }

    if (event.contentBlockStart?.start?.toolUse && current) {
      const idx = event.contentBlockStart.contentBlockIndex;
      current.content[idx] = { toolUse: { ...event.contentBlockStart.start.toolUse, input: "" } };
    }

    if (event.contentBlockDelta && current) {
      const idx = event.contentBlockDelta.contentBlockIndex;
      const delta = event.contentBlockDelta.delta;
      if (delta.text !== undefined) {
        current.content[idx] = current.content[idx] || {};
        current.content[idx].text = (current.content[idx].text || "") + delta.text;
      }
      if (delta.toolUse && current.content[idx]?.toolUse) {
        current.content[idx].toolUse.input += delta.toolUse.input;
      }
    }

    if (event.toolResult) {
      // Server sends toolResult events between model turns
      const trMessage = messages.find(
        (m) => m.role === "user" && m.content.some((c) => c.toolResult)
      );
      if (trMessage) {
        trMessage.content.push(event);
      } else {
        messages.push({ role: "user", content: [event] });
      }
      current = null; // Next messageStart will create new assistant message
    }
  }

  return messages;
}

test("Agent Chat E2E Tests", async (t) => {
  let agentId;
  let conversationId;
  let toolConversationId;

  // ── Setup: mirrors what chat-v2 does when user creates/selects an agent ──

  await t.test("setup: create agent with search tool", async () => {
    const { status, json } = await api("POST", "/agents", {
      name: "E2E Test Agent",
      tools: ["search"],
    });
    assert.strictEqual(status, 201, `create agent: expected 201, got ${status}`);
    assert.ok(json.id, "agent should have id");
    agentId = json.id;

    // Verify the agent was created with tools (getAgent returns tools from AgentTool join)
    const { json: agentRecord } = await api("GET", `/agents/${agentId}`);
    assert.ok(
      Array.isArray(agentRecord.tools),
      `agent.tools should be an array, got ${typeof agentRecord.tools}`
    );
    assert.ok(
      agentRecord.tools.includes("search"),
      `agent should have "search" tool, got: ${JSON.stringify(agentRecord.tools)}`
    );
  });

  await t.test("setup: create conversations (like clicking New Chat)", async () => {
    const r1 = await api("POST", "/conversations", {
      title: "__agent_e2e_basic__",
      agentId,
    });
    assert.strictEqual(r1.status, 201);
    conversationId = r1.json.id;

    const r2 = await api("POST", "/conversations", {
      title: "__agent_e2e_tool__",
      agentId,
    });
    assert.strictEqual(r2.status, 201);
    toolConversationId = r2.json.id;
  });

  // ── Test 1: Full tool-use loop ─────────────────────────────────────────
  // Mirrors an explicit scripted tool call so the test controls when the agent loop enters tool_use.

  await t.test("full loop: scripted-model calls search tool, gets results, responds", async () => {
    const scriptedPrompt = scriptedToolUse("search", { query: "NCI cancer research" });
    const { response, events } = await sendChatMessage(agentId, toolConversationId, scriptedPrompt);

    assert.ok(response.ok, `agent chat failed: ${response.status}`);
    assert.ok(events.length > 0, "should receive NDJSON events");

    // Should have TWO model turns: tool_use then end_turn
    const messageStops = events.filter((e) => e.messageStop);
    assert.strictEqual(
      messageStops.length,
      2,
      `expected 2 messageStop events (tool_use + end_turn), got ${messageStops.length}`
    );
    assert.strictEqual(messageStops[0].messageStop.stopReason, "tool_use");
    assert.strictEqual(messageStops[1].messageStop.stopReason, "end_turn");

    // Should have toolResult events between the two model turns
    const toolResults = events.filter((e) => e.toolResult);
    assert.ok(toolResults.length >= 1, "should have at least one toolResult event");
    assert.strictEqual(toolResults[0].toolResult.toolUseId, SCRIPTED_TOOL_USE_ID);

    // Tool result should contain actual search results (from real Brave Search)
    const resultContent = toolResults[0].toolResult.content;
    assert.ok(resultContent, "toolResult should have content");

    // Verify client can reconstruct messages from the stream (like processContentBlock does)
    const reconstructed = reconstructMessagesFromEvents(events);
    assert.ok(
      reconstructed.length >= 3,
      `should reconstruct at least 3 messages, got ${reconstructed.length}`
    );

    // First assistant message should have a tool_use block
    const firstAssistant = reconstructed.find((m) => m.role === "assistant");
    assert.ok(firstAssistant, "should have an assistant message");
    const toolUseBlock = firstAssistant?.content?.find((c) => c.toolUse);
    assert.ok(toolUseBlock, "first assistant message should contain toolUse");
    assert.strictEqual(toolUseBlock.toolUse.name, "search", "tool should be search");
    assert.ok(
      toolUseBlock.toolUse.input.includes("NCI cancer research"),
      "tool input should preserve the scripted search query"
    );
  });

  // ── Test 2: Messages persisted correctly (server-side persistence) ─────
  // The agent loop persists messages during execution. Verify the CMS has the full history.

  await t.test(
    "messages persisted: user → assistant(tool_use) → user(tool_results) → assistant(end_turn)",
    async () => {
      const { status, json: messages } = await api(
        "GET",
        `/conversations/${toolConversationId}/messages`
      );
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(messages), "messages should be an array");

      // Full loop should persist 4 messages:
      // 1. user message
      // 2. assistant message with tool_use
      // 3. user message with tool_results
      // 4. assistant message with text (end_turn)
      assert.ok(
        messages.length >= 4,
        `expected at least 4 persisted messages, got ${messages.length}`
      );

      assert.strictEqual(messages[0].role, "user", "first message should be user");
      assert.strictEqual(messages[1].role, "assistant", "second should be assistant (tool_use)");
      assert.strictEqual(messages[2].role, "user", "third should be user (tool_results)");
      assert.strictEqual(messages[3].role, "assistant", "fourth should be assistant (end_turn)");

      // Verify the user message content
      const userText = messages[0].content?.find((c) => c.text);
      assert.ok(userText, "user message should have text");
      assert.strictEqual(
        userText.text,
        scriptedToolUse("search", { query: "NCI cancer research" }),
        "persisted user message should preserve the full scripted tool-use payload"
      );

      // Verify assistant tool_use message
      const toolUseBlock = messages[1].content?.find((c) => c.toolUse);
      assert.ok(toolUseBlock, "assistant message should contain toolUse block");
      assert.strictEqual(toolUseBlock.toolUse.name, "search");

      // Verify tool results message
      const toolResultBlock = messages[2].content?.find((c) => c.toolResult);
      assert.ok(toolResultBlock, "tool results message should contain toolResult block");

      // Verify final assistant text
      const finalText = messages[3].content?.find((c) => c.text !== undefined);
      assert.ok(finalText, "final assistant message should have text");
      assert.ok(finalText.text.length > 0, "final text should not be empty");
    }
  );

  // ── Test 3: Multi-turn context (follow-up in same conversation) ───────
  // Mirrors: user sends a second message in the same conversation.

  await t.test("second message in same conversation loads prior context", async () => {
    const { response, events } = await sendChatMessage(
      agentId,
      toolConversationId,
      "Follow-up question about the results"
    );
    assert.ok(response.ok, `second chat failed: ${response.status}`);
    assert.ok(events.length > 0, "should receive events for follow-up");

    // Follow-up uses plain text, so the scripted model should deterministically echo end_turn.
    const { json: messages } = await api("GET", `/conversations/${toolConversationId}/messages`);
    assert.ok(
      messages.length >= 6,
      `expected at least 6 messages after two rounds, got ${messages.length}`
    );
    // Last message should be from the second round
    assert.strictEqual(messages.at(-1).role, "assistant", "last message should be assistant");
    const finalText = messages.at(-1)?.content?.find((content) => content.text !== undefined);
    assert.strictEqual(finalText?.text, "Follow-up question about the results");
  });

  // ── Test 4: Agent without tools → single end_turn (no tool loop) ──────
  // Mirrors: user with an agent that has no tools configured.

  await t.test("agent chat without tools returns simple end_turn", async () => {
    const { json: noToolsAgent } = await api("POST", "/agents", {
      name: "No Tools Agent",
      tools: [],
    });

    const { json: conv } = await api("POST", "/conversations", {
      title: "__agent_e2e_no_tools__",
      agentId: noToolsAgent.id,
    });

    const { response, events } = await sendChatMessage(
      noToolsAgent.id,
      conv.id,
      "Hello without tools"
    );

    assert.ok(response.ok, `no-tools chat failed: ${response.status}`);

    // Should be a single turn — end_turn only
    const messageStops = events.filter((e) => e.messageStop);
    assert.strictEqual(messageStops.length, 1, "should have exactly 1 messageStop");
    assert.strictEqual(messageStops[0].messageStop.stopReason, "end_turn");

    // No tool results
    const toolResults = events.filter((e) => e.toolResult);
    assert.strictEqual(toolResults.length, 0, "should have no toolResult events");

    // Verify persisted messages (user + assistant only)
    const { json: messages } = await api("GET", `/conversations/${conv.id}/messages`);
    assert.strictEqual(
      messages.length,
      2,
      `expected 2 messages (user + assistant), got ${messages.length}`
    );
    assert.strictEqual(messages[0].role, "user");
    assert.strictEqual(messages[1].role, "assistant");

    // Cleanup
    await api("DELETE", `/conversations/${conv.id}`);
    await api("DELETE", `/agents/${noToolsAgent.id}`);
  });

  // ── Test 5: Error handling — missing message content ───────────────────

  await t.test("POST without message content returns 400", async () => {
    const response = await fetch(`/api/v1/agents/${agentId}/conversations/${conversationId}/chat`, {
      method: "POST",
      headers: createApiHeaders(),
      body: JSON.stringify({ model: SCRIPTED_MODEL }),
    });
    assert.strictEqual(response.status, 400, "should reject missing message content");
  });

  // ── Test 6: Error handling — nonexistent agent ─────────────────────────

  await t.test("nonexistent agent returns agentError in stream", async () => {
    const { events } = await sendChatMessage(99999, conversationId, "test");
    const errorEvent = events.find((e) => e.agentError);
    assert.ok(errorEvent, "should receive an agentError event for nonexistent agent");
    assert.ok(errorEvent.agentError.message, "error should have a message");
  });

  // ── Test 7: Stream event structure matches what hooks.js expects ───────
  // Validates the NDJSON stream has the events processContentBlock needs.

  await t.test("stream events have correct structure for client rendering", async () => {
    const { json: conv } = await api("POST", "/conversations", {
      title: "__agent_e2e_structure__",
      agentId,
    });

    const { response, events } = await sendChatMessage(agentId, conv.id, "Test structure");

    assert.ok(response.ok);

    // Must have messageStart (hooks.js uses this to create assistant message)
    const messageStarts = events.filter((e) => e.messageStart);
    assert.ok(messageStarts.length >= 1, "should have at least 1 messageStart event");
    assert.strictEqual(messageStarts[0].messageStart.role, "assistant");

    // Must have contentBlockStart (hooks.js uses this to init content blocks)
    const blockStarts = events.filter((e) => e.contentBlockStart);
    assert.ok(blockStarts.length >= 1, "should have at least 1 contentBlockStart");

    // Must have contentBlockDelta (hooks.js uses this to accumulate text/toolUse)
    const blockDeltas = events.filter((e) => e.contentBlockDelta);
    assert.ok(blockDeltas.length >= 1, "should have at least 1 contentBlockDelta");

    // Must have contentBlockStop
    const blockStops = events.filter((e) => e.contentBlockStop);
    assert.ok(blockStops.length >= 1, "should have at least 1 contentBlockStop");

    // Cleanup
    await api("DELETE", `/conversations/${conv.id}`);
  });

  // ── Test 8: Recall tool E2E ─────────────────────────────────────────
  // Tests the full recall pipeline: seed a conversation with searchable text,
  // then have a recall agent search for it in a separate conversation.

  await t.test("recall tool: finds text from a previous conversation", async () => {
    // 1. Create an agent with recall tool
    const { status: agentStatus, json: recallAgent } = await api("POST", "/agents", {
      name: "Recall E2E Agent",
      tools: ["recall"],
    });
    assert.strictEqual(agentStatus, 201, `create recall agent: expected 201, got ${agentStatus}`);

    // 2. Create conversation A with searchable text for the scripted recall query
    const { json: convA } = await api("POST", "/conversations", {
      title: "__recall_e2e_source__",
      agentId: recallAgent.id,
    });
    assert.ok(convA.id);

    const seedText = "This is a recall verification message for scripted recall testing";
    await api("POST", `/conversations/${convA.id}/messages`, {
      role: "user",
      content: [{ text: seedText }],
    });

    // 3. Verify message is persisted
    const { json: seededMessages } = await api("GET", `/conversations/${convA.id}/messages`);
    assert.ok(seededMessages.length >= 1, "seeded message should be persisted");
    assert.ok(
      seededMessages[0].content.some((c) => c.text?.includes("recall verification")),
      "seeded message should contain searchable text"
    );

    // 4. Create conversation B to trigger recall
    const { json: convB } = await api("POST", "/conversations", {
      title: "__recall_e2e_search__",
      agentId: recallAgent.id,
    });
    assert.ok(convB.id);

    // 5. Send an explicit scripted recall tool call
    const { response, events } = await sendChatMessage(
      recallAgent.id,
      convB.id,
      scriptedToolUse("recall", { query: "recall verification" })
    );

    assert.ok(response.ok, `recall chat failed: ${response.status}`);
    assert.ok(events.length > 0, "should receive NDJSON events");

    // Should have tool_use turn then end_turn
    const messageStops = events.filter((e) => e.messageStop);
    assert.strictEqual(
      messageStops.length,
      2,
      `expected 2 messageStop events (tool_use + end_turn), got ${messageStops.length}`
    );
    assert.strictEqual(messageStops[0].messageStop.stopReason, "tool_use");
    assert.strictEqual(messageStops[1].messageStop.stopReason, "end_turn");

    // Should have toolResult with recall results
    const toolResults = events.filter((e) => e.toolResult);
    assert.ok(toolResults.length >= 1, "should have at least one toolResult");
    const resultContent = toolResults[0].toolResult.content;
    assert.ok(resultContent, "toolResult should have content");

    // Tool result is wrapped as { json: { results: <string> } }
    const resultText = JSON.stringify(resultContent);
    assert.ok(
      resultText.includes("recall verification") || resultText.includes("Conversation Messages"),
      `toolResult should contain seeded text or recall sections, got: ${resultText.slice(0, 300)}`
    );

    // 6. Cleanup
    await api("DELETE", `/conversations/${convA.id}`);
    await api("DELETE", `/conversations/${convB.id}`);
    await api("DELETE", `/agents/${recallAgent.id}`);
  });

  // ── Cleanup ────────────────────────────────────────────────────────────

  await t.test("cleanup", async () => {
    await api("DELETE", `/conversations/${conversationId}`);
    await api("DELETE", `/conversations/${toolConversationId}`);
    await api("DELETE", `/agents/${agentId}`);
  });
});
