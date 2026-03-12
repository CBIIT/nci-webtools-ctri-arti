import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { runAgentLoop } from "../loop.js";

describe("runAgentLoop", () => {
  function createMockGateway(streamEvents) {
    return {
      invoke: async () => ({
        stream: (async function* () {
          for (const event of streamEvents) {
            yield event;
          }
        })(),
      }),
    };
  }

  function createMockCms(agent = {}) {
    const messages = [];
    const resources = [];
    return {
      getAgent: async () => ({
        name: "TestAgent",
        tools: ["search", "browse"],
        systemPrompt: null,
        ...agent,
      }),
      getContext: async () => ({ messages: [] }),
      addMessage: async (userId, conversationId, msg) => {
        messages.push(msg);
        return msg;
      },
      getResourcesByAgent: async () => resources,
      _messages: messages,
    };
  }

  it("streams events and persists messages for end_turn", async () => {
    const streamEvents = [
      { contentBlockStart: { contentBlockIndex: 0 } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Hello " } } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "world" } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: "end_turn" } },
    ];

    const gateway = createMockGateway(streamEvents);
    const cms = createMockCms();

    const events = [];
    const loop = runAgentLoop({
      userId: 1,
      agentId: 1,
      conversationId: 1,
      userMessage: { role: "user", content: [{ text: "Hi" }] },
      model: "test-model",
      gateway,
      cms,
    });

    for await (const event of loop) {
      events.push(event);
    }

    // Should have forwarded all stream events
    assert.equal(events.length, streamEvents.length);

    // Should have persisted user message + assistant message
    assert.equal(cms._messages.length, 2);
    assert.equal(cms._messages[0].role, "user");
    assert.equal(cms._messages[1].role, "assistant");
  });

  it("yields rate limit error", async () => {
    const gateway = {
      invoke: async () => ({ error: "Rate limited", status: 429 }),
    };
    const cms = createMockCms();

    const events = [];
    const loop = runAgentLoop({
      userId: 1,
      agentId: 1,
      conversationId: 1,
      userMessage: { role: "user", content: [{ text: "Hi" }] },
      model: "test-model",
      gateway,
      cms,
    });

    for await (const event of loop) {
      events.push(event);
    }

    assert.equal(events.length, 1);
    assert.ok(events[0].agentError);
    assert.equal(events[0].agentError.message, "Rate limited");
  });

  it("throws for missing agent", async () => {
    const gateway = createMockGateway([]);
    const cms = {
      ...createMockCms(),
      getAgent: async () => null,
    };

    const loop = runAgentLoop({
      userId: 1,
      agentId: 999,
      conversationId: 1,
      userMessage: { role: "user", content: [{ text: "Hi" }] },
      model: "test-model",
      gateway,
      cms,
    });

    await assert.rejects(async () => {
      for await (const _ of loop) {
        // consume
      }
    }, /Agent not found/);
  });

  it("handles tool_use stop reason with tool execution", async () => {
    let callCount = 0;

    // First call: model uses a tool
    const toolUseEvents = [
      {
        contentBlockStart: {
          contentBlockIndex: 0,
          start: { toolUse: { toolUseId: "tu_1", name: "search" } },
        },
      },
      {
        contentBlockDelta: {
          contentBlockIndex: 0,
          delta: { toolUse: { input: '{"query":"test"}' } },
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: "tool_use" } },
    ];

    // Second call: model responds with end_turn
    const endTurnEvents = [
      { contentBlockStart: { contentBlockIndex: 0 } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Done" } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: "end_turn" } },
    ];

    const gateway = {
      invoke: async () => {
        callCount++;
        const events = callCount === 1 ? toolUseEvents : endTurnEvents;
        return {
          stream: (async function* () {
            for (const e of events) yield e;
          })(),
        };
      },
    };

    const cms = createMockCms();

    const events = [];
    const loop = runAgentLoop({
      userId: 1,
      agentId: 1,
      conversationId: 1,
      userMessage: { role: "user", content: [{ text: "Search for test" }] },
      model: "test-model",
      gateway,
      cms,
    });

    for await (const event of loop) {
      events.push(event);
    }

    // Should have 2 gateway calls (tool_use + end_turn)
    assert.equal(callCount, 2);

    // Should have tool result events
    const toolResults = events.filter((e) => e.toolResult);
    assert.equal(toolResults.length, 1);
    assert.equal(toolResults[0].toolResult.toolUseId, "tu_1");

    // Should have persisted: user + assistant(tool_use) + tool_results + assistant(end_turn)
    assert.equal(cms._messages.length, 4);
  });

  it("filters out code tool from server-side execution", async () => {
    const gateway = createMockGateway([{ messageStop: { stopReason: "end_turn" } }]);
    const cms = createMockCms({ tools: ["search", "code", "browse"] });

    let invokedTools;
    gateway.invoke = async (params) => {
      invokedTools = params.tools;
      return {
        stream: (async function* () {
          yield { messageStop: { stopReason: "end_turn" } };
        })(),
      };
    };

    const loop = runAgentLoop({
      userId: 1,
      agentId: 1,
      conversationId: 1,
      userMessage: { role: "user", content: [{ text: "Hi" }] },
      model: "test-model",
      gateway,
      cms,
    });

    for await (const _ of loop) {
      // consume
    }

    // "code" should be filtered out
    const toolNames = invokedTools.map((t) => t.toolSpec.name);
    assert.ok(!toolNames.includes("code"), "code tool should be excluded");
    assert.ok(toolNames.includes("search"), "search should be included");
    assert.ok(toolNames.includes("browse"), "browse should be included");
  });
});
