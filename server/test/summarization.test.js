import db, { User, Model, Message } from "database";
import assert from "node:assert";
import { test } from "node:test";

import { ConversationService } from "cms/conversation.js";
import { eq } from "drizzle-orm";

const HAIKU_ID = 3; // Haiku model from seed data
const SONNET_ID = 2; // Sonnet model from seed data
const ORIGINAL_HAIKU_MAX_CONTEXT = 200000;
const ORIGINAL_SONNET_MAX_CONTEXT = 1000000;
const TINY_MAX_CONTEXT = 50; // ~40 token threshold (50 * 0.8), ~320 chars of text
const CONVERSATION_SUMMARY_TOKEN = "[Conversation Summary]";

let testUser;

async function setMaxContext(modelId, value) {
  await db.update(Model).set({ maxContext: value }).where(eq(Model.id, modelId));
}

test("Automatic Conversation Summarization", async (t) => {
  const svc = new ConversationService();

  // ===== SETUP =====

  await t.test("setup", async () => {
    [testUser] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(testUser, "Test user should exist from seed");

    // Shrink context windows to force summarization
    await setMaxContext(HAIKU_ID, TINY_MAX_CONTEXT);
    await setMaxContext(SONNET_ID, TINY_MAX_CONTEXT);

    const [haiku] = await db.select().from(Model).where(eq(Model.id, HAIKU_ID)).limit(1);
    assert.strictEqual(haiku.maxContext, TINY_MAX_CONTEXT);
    const [sonnet] = await db.select().from(Model).where(eq(Model.id, SONNET_ID)).limit(1);
    assert.strictEqual(sonnet.maxContext, TINY_MAX_CONTEXT);
  });

  // ===== 1. addMessage is a pure insert (no summarization) =====

  await t.test("addMessage does not trigger summarization", async () => {
    let invoked = false;
    ConversationService.setInvoker(async () => {
      invoked = true;
      return {
        output: { message: { content: [{ text: "should not be called" }] } },
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    });

    const agent = await svc.createAgent(testUser.id, {
      name: "Pure Insert Agent",
      modelID: HAIKU_ID,
    });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Pure Insert Test",
    });

    // Add a large message — should NOT trigger summarization
    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "A".repeat(400) }],
    });

    assert.strictEqual(invoked, false, "Invoker should not be called by addMessage");
    const conv = await svc.getConversation(testUser.id, conversation.id);
    assert.strictEqual(conv.summaryMessageID, null, "No summary from addMessage");
  });

  // ===== 2. summarize() triggers when tokens exceed 80% =====

  await t.test("summarize() triggers when tokens exceed 80% of maxContext", async () => {
    let invokedWith = null;
    const summaryText =
      `${CONVERSATION_SUMMARY_TOKEN}\n\n` +
      "This is the mock summary of the conversation including all key decisions and context needed to continue.";

    ConversationService.setInvoker(async (params) => {
      invokedWith = params;
      return {
        stream: (async function* () {
          yield { contentBlockStart: { contentBlockIndex: 0 } };
          yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text: summaryText } } };
          yield { contentBlockStop: { contentBlockIndex: 0 } };
          yield { messageStop: { stopReason: "end_turn" } };
        })(),
      };
    });

    const agent = await svc.createAgent(testUser.id, {
      name: "Summarize Agent",
      modelID: HAIKU_ID,
    });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Summarization Test",
    });

    // Add messages that stay under threshold
    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "Hi" }],
    });
    await svc.addMessage(testUser.id, conversation.id, {
      role: "assistant",
      content: [{ text: "Hello!" }],
    });

    // summarize() should yield nothing — not enough tokens
    let chunks = [];
    for await (const chunk of svc.summarize(testUser.id, conversation.id, {
      userText: "Hi",
    })) {
      chunks.push(chunk);
    }
    assert.strictEqual(chunks.length, 0, "Should not summarize short conversation");
    assert.strictEqual(invokedWith, null, "Invoker should not have been called");

    // Add a large message that pushes past 80%
    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "A".repeat(400) }],
    });

    // Now summarize() should trigger
    chunks = [];
    for await (const chunk of svc.summarize(testUser.id, conversation.id, {
      model: "custom-model",
      system: "test system",
      tools: [{ toolSpec: { name: "search" } }],
      thoughtBudget: 1024,
      userText: "A".repeat(400),
    })) {
      chunks.push(chunk);
    }

    assert.ok(chunks.length > 0, "Should have yielded chunks");
    assert.ok(invokedWith, "Invoker should have been called");
    assert.strictEqual(invokedWith.type, "chat-summary");
    assert.strictEqual(invokedWith.model, "custom-model", "Should use caller-provided model");
    assert.strictEqual(invokedWith.system, "test system", "Should pass through system prompt");
    assert.deepStrictEqual(
      invokedWith.tools,
      [{ toolSpec: { name: "search" } }],
      "Should pass through tools"
    );
    assert.strictEqual(invokedWith.thoughtBudget, 1024, "Should pass through thoughtBudget");

    // Verify the summarize instruction is in the messages
    const lastMsg = invokedWith.messages[invokedWith.messages.length - 1];
    assert.ok(lastMsg.content[0].text.includes(CONVERSATION_SUMMARY_TOKEN));
    assert.ok(lastMsg.content[0].text.includes("Summarize the entire conversation"));
    assert.ok(lastMsg.content[0].text.includes("Latest User Message"));

    // Verify conversation now has summaryMessageID
    const conv = await svc.getConversation(testUser.id, conversation.id);
    assert.ok(conv.summaryMessageID, "summaryMessageID should be set");

    // Verify the summary message
    const summaryMsg = await svc.getMessage(testUser.id, conv.summaryMessageID);
    assert.ok(summaryMsg, "Summary message should exist");
    assert.strictEqual(summaryMsg.role, "user");
    assert.ok(summaryMsg.content[0].text.includes(CONVERSATION_SUMMARY_TOKEN));
    assert.strictEqual(
      summaryMsg.content[0].text.match(/\[Conversation Summary\]/g)?.length,
      1,
      "Summary token should only be prefixed once"
    );
    assert.ok(summaryMsg.content[0].text.includes("mock summary"));

    // Verify getContext with compressed=true
    const compressed = await svc.getContext(testUser.id, conversation.id, { compressed: true });
    assert.ok(compressed.messages.length > 0);
    assert.ok(
      compressed.messages[0].id >= conv.summaryMessageID,
      "Compressed context should start at or after summaryMessageID"
    );

    const full = await svc.getContext(testUser.id, conversation.id);
    assert.ok(
      full.messages.length > compressed.messages.length,
      "Full context has more messages than compressed"
    );
  });

  // ===== 3. RE-SUMMARIZATION =====

  await t.test("re-summarizes when new messages exceed threshold again", async () => {
    let invokeCount = 0;

    ConversationService.setInvoker(async (_params) => {
      invokeCount++;
      const text = `Re-summary #${invokeCount}: comprehensive conversation summary with all key decisions and requirements preserved.`;
      return {
        stream: (async function* () {
          yield { contentBlockStart: { contentBlockIndex: 0 } };
          yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text } } };
          yield { contentBlockStop: { contentBlockIndex: 0 } };
          yield { messageStop: { stopReason: "end_turn" } };
        })(),
      };
    });

    const agent = await svc.createAgent(testUser.id, {
      name: "Resummarize Agent",
      modelID: HAIKU_ID,
    });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Re-summarization Test",
    });

    // Add large message and summarize
    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "B".repeat(400) }],
    });
    for await (const _ of svc.summarize(testUser.id, conversation.id, {
      userText: "B".repeat(400),
    })) {
      /* drain */
    }

    let conv = await svc.getConversation(testUser.id, conversation.id);
    const firstSummaryID = conv.summaryMessageID;
    assert.ok(firstSummaryID, "First summary should exist");
    assert.strictEqual(invokeCount, 1);

    // Add more messages after the summary to push past the threshold again
    await svc.addMessage(testUser.id, conversation.id, {
      role: "assistant",
      content: [{ text: "C".repeat(400) }],
    });
    for await (const _ of svc.summarize(testUser.id, conversation.id, { userText: "continue" })) {
      /* drain */
    }

    conv = await svc.getConversation(testUser.id, conversation.id);
    const secondSummaryID = conv.summaryMessageID;
    assert.ok(secondSummaryID, "Second summary should exist");
    assert.ok(secondSummaryID > firstSummaryID, "Second summary should have a higher ID");
    assert.strictEqual(invokeCount, 2);

    const firstSummary = await svc.getMessage(testUser.id, firstSummaryID);
    const secondSummary = await svc.getMessage(testUser.id, secondSummaryID);
    assert.ok(firstSummary, "First summary message preserved");
    assert.ok(secondSummary, "Second summary message preserved");
    assert.ok(secondSummary.content[0].text.includes("Re-summary #2:"));
  });

  // ===== 4. FAILURE HANDLING =====

  await t.test("throws on invoker failure", async () => {
    ConversationService.setInvoker(async () => {
      throw new Error("Simulated gateway failure");
    });

    const agent = await svc.createAgent(testUser.id, { name: "Failure Agent", modelID: HAIKU_ID });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Failure Test",
    });

    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "D".repeat(400) }],
    });

    await assert.rejects(async () => {
      for await (const _ of svc.summarize(testUser.id, conversation.id, { userText: "test" })) {
        /* drain */
      }
    }, /Simulated gateway failure/);

    const conv = await svc.getConversation(testUser.id, conversation.id);
    assert.strictEqual(
      conv.summaryMessageID,
      null,
      "summaryMessageID should be null after failure"
    );
  });

  // ===== 5. NO INVOKER = NO SUMMARIZATION =====

  await t.test("yields nothing when no invoker is set", async () => {
    ConversationService.setInvoker(null);

    const agent = await svc.createAgent(testUser.id, {
      name: "No Invoker Agent",
      modelID: HAIKU_ID,
    });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "No Invoker Test",
    });

    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "E".repeat(400) }],
    });

    const chunks = [];
    for await (const chunk of svc.summarize(testUser.id, conversation.id, { userText: "test" })) {
      chunks.push(chunk);
    }
    assert.strictEqual(chunks.length, 0, "No summarization without invoker");

    const conv = await svc.getConversation(testUser.id, conversation.id);
    assert.strictEqual(conv.summaryMessageID, null, "No summarization without invoker");
  });

  // ===== 6. DEFAULTS TO SONNET WHEN AGENT HAS NO MODEL =====

  await t.test("defaults to Sonnet when agent has no modelID", async () => {
    let invokedModel = null;
    const text =
      "Sonnet default summary with enough content to pass the minimum length validation for summaries.";

    ConversationService.setInvoker(async (params) => {
      invokedModel = params.model;
      return {
        stream: (async function* () {
          yield { contentBlockStart: { contentBlockIndex: 0 } };
          yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text } } };
          yield { contentBlockStop: { contentBlockIndex: 0 } };
          yield { messageStop: { stopReason: "end_turn" } };
        })(),
      };
    });

    const agent = await svc.createAgent(testUser.id, { name: "No Model Agent" });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Default Model Test",
    });

    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "F".repeat(400) }],
    });

    // No model passed — should fall back to check.model (Sonnet default)
    for await (const _ of svc.summarize(testUser.id, conversation.id, { userText: "test" })) {
      /* drain */
    }
    assert.strictEqual(invokedModel, "us.anthropic.claude-sonnet-4-6", "Should default to Sonnet");

    const conv = await svc.getConversation(testUser.id, conversation.id);
    assert.ok(conv.summaryMessageID, "Summary should exist using Sonnet default");
  });

  // ===== 7. GETCONTEXT IGNORES NULL-CONTENT PLACEHOLDER =====

  await t.test("getContext ignores summary placeholder with null content", async () => {
    ConversationService.setInvoker(null);

    const agent = await svc.createAgent(testUser.id, {
      name: "Placeholder Agent",
      modelID: HAIKU_ID,
    });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Placeholder Test",
    });

    const msg1 = await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "message one" }],
    });
    const _msg2 = await svc.addMessage(testUser.id, conversation.id, {
      role: "assistant",
      content: [{ text: "message two" }],
    });

    // Manually insert a placeholder (null content) and set summaryMessageID
    const [placeholder] = await db
      .insert(Message)
      .values({ conversationID: conversation.id, role: "user", content: null })
      .returning();

    await svc.updateConversation(testUser.id, conversation.id, {
      summaryMessageID: placeholder.id,
    });

    const context = await svc.getContext(testUser.id, conversation.id, { compressed: true });
    assert.ok(
      context.messages.length >= 2,
      "Should return all messages when placeholder has null content"
    );
    assert.ok(
      context.messages.some((m) => m.id === msg1.id),
      "Should include messages before the placeholder"
    );
  });

  // ===== TEARDOWN =====

  await t.test("teardown: restore maxContext values", async () => {
    await setMaxContext(HAIKU_ID, ORIGINAL_HAIKU_MAX_CONTEXT);
    await setMaxContext(SONNET_ID, ORIGINAL_SONNET_MAX_CONTEXT);
    ConversationService.setInvoker(null);

    const [haiku] = await db.select().from(Model).where(eq(Model.id, HAIKU_ID)).limit(1);
    assert.strictEqual(haiku.maxContext, ORIGINAL_HAIKU_MAX_CONTEXT, "Haiku maxContext restored");
    const [sonnet] = await db.select().from(Model).where(eq(Model.id, SONNET_ID)).limit(1);
    assert.strictEqual(
      sonnet.maxContext,
      ORIGINAL_SONNET_MAX_CONTEXT,
      "Sonnet maxContext restored"
    );
  });
});
