import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
      getConversation: async () => ({ id: 1, createdAt: "2026-01-15T12:00:00Z" }),
      getContext: async () => ({ messages: [] }),
      addMessage: async (userId, conversationId, msg) => {
        messages.push(msg);
        return msg;
      },
      summarize: async function* () {},
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

    // No summarization should be emitted when cms.summarize() yields nothing
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

  it("only emits summarizing events when summarize yields chunks", async () => {
    const streamEvents = [
      { messageStart: { role: "assistant" } },
      { contentBlockStart: { contentBlockIndex: 0 } },
      { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Done" } } },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: "end_turn" } },
    ];

    const gateway = createMockGateway(streamEvents);
    const cms = {
      ...createMockCms(),
      summarize: async function* () {
        yield { contentBlockStart: { contentBlockIndex: 0 } };
        yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Summary" } } };
        yield { contentBlockStop: { contentBlockIndex: 0 } };
      },
    };

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

    assert.equal(events[0].summarizing, true);
    assert.ok(events.some((event) => event.contentBlockDelta?.delta?.text === "Summary"));
    assert.ok(events.some((event) => event.summarizing === false));
  });

  it("preserves originalName on persisted uploaded files", async () => {
    const streamEvents = [{ messageStop: { stopReason: "end_turn" } }];
    const gateway = createMockGateway(streamEvents);
    const resources = [];
    const cms = {
      ...createMockCms(),
      addResource: async (_userId, resource) => {
        resources.push(resource);
        return resource;
      },
    };

    const loop = runAgentLoop({
      userId: 1,
      agentId: 1,
      conversationId: 1,
      userMessage: {
        role: "user",
        content: [
          {
            document: {
              name: "document",
              originalName: "book.md",
              format: "md",
              source: { bytes: Buffer.from("hello", "utf-8").toString("base64") },
            },
          },
          { text: "Please read this." },
        ],
      },
      model: "test-model",
      gateway,
      cms,
    });

    for await (const _event of loop) {
      // consume
    }

    assert.equal(resources.length, 1);
    assert.equal(resources[0].name, "book.md");
    assert.equal(cms._messages[0].content[0].document.originalName, "book.md");
  });

  it("adds summary continuation guidance when compressed context starts from a conversation summary", async () => {
    let invokedWith = null;
    const gateway = {
      invoke: async (params) => {
        invokedWith = {
          ...params,
          messages: params.messages.map((message) => ({
            ...message,
            content: [...message.content],
          })),
        };
        return {
          stream: (async function* () {
            yield { contentBlockStart: { contentBlockIndex: 0 } };
            yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Done" } } };
            yield { contentBlockStop: { contentBlockIndex: 0 } };
            yield { messageStop: { stopReason: "end_turn" } };
          })(),
        };
      },
    };

    const cms = {
      ...createMockCms(),
      getContext: async () => ({
        messages: [
          {
            role: "user",
            content: [
              {
                text: "[Conversation Summary]\n\n## Latest User Message\n> well, did you read it?",
              },
            ],
          },
        ],
      }),
    };

    const loop = runAgentLoop({
      userId: 1,
      agentId: 1,
      conversationId: 1,
      userMessage: { role: "user", content: [{ text: "well, did you read it?" }] },
      model: "test-model",
      gateway,
      cms,
    });

    for await (const _ of loop) {
      // consume
    }

    assert.ok(invokedWith, "Gateway should be invoked");
    assert.equal(
      invokedWith.messages.length,
      1,
      "Summary user message should stand in for the current turn"
    );
    assert.equal(invokedWith.messages[0].role, "user");
    assert.ok(
      invokedWith.messages[0].content[0].text.includes("[Conversation Summary]"),
      "Conversation summary should be passed through as the opening user turn"
    );
  });
});
