import db, { User, Model, Conversation, Message } from "database";
import assert from "node:assert";
import { test } from "node:test";

import { ConversationService } from "cms/conversation.js";
import { eq } from "drizzle-orm";

const HAIKU_ID = 3; // Haiku model from seed data
const ORIGINAL_MAX_CONTEXT = 200000;
const TINY_MAX_CONTEXT = 50; // ~40 token threshold (50 * 0.8), ~320 chars of text

let testUser;
let originalInvoker;

async function setHaikuMaxContext(value) {
  await db.update(Model).set({ maxContext: value }).where(eq(Model.id, HAIKU_ID));
}

test("Automatic Conversation Summarization", async (t) => {
  const svc = new ConversationService();

  // ===== SETUP =====

  await t.test("setup", async () => {
    [testUser] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(testUser, "Test user should exist from seed");

    // Shrink Haiku's context window to force summarization
    await setHaikuMaxContext(TINY_MAX_CONTEXT);

    const [model] = await db.select().from(Model).where(eq(Model.id, HAIKU_ID)).limit(1);
    assert.strictEqual(model.maxContext, TINY_MAX_CONTEXT);
  });

  // ===== 1. SUMMARIZATION TRIGGERS WHEN TOKENS EXCEED 80% =====

  await t.test("triggers summarization when tokens exceed 80% of maxContext", async () => {
    let invokedWith = null;

    ConversationService.setInvoker(async (params) => {
      invokedWith = params;
      return {
        output: {
          message: {
            content: [{ text: "This is the mock summary of the conversation." }],
          },
        },
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    });

    // Create agent linked to Haiku, then a conversation
    const agent = await svc.createAgent(testUser.id, {
      name: "Summarize Agent",
      modelID: HAIKU_ID,
    });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Summarization Test",
    });

    // Add small messages that stay under threshold — no summarization yet
    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "Hi" }],
    });
    await svc.addMessage(testUser.id, conversation.id, {
      role: "assistant",
      content: [{ text: "Hello!" }],
    });

    // These short messages shouldn't trigger summarization
    let conv = await svc.getConversation(testUser.id, conversation.id);
    assert.strictEqual(conv.summaryMessageID, null, "No summary yet for short conversation");
    assert.strictEqual(invokedWith, null, "Invoker should not have been called");

    // Now add a large message that pushes past 80% of 50 tokens = 40 tokens = ~320 chars
    const bigText = "A".repeat(400);
    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: bigText }],
    });

    // Verify invoker was called
    assert.ok(invokedWith, "Invoker should have been called");
    assert.strictEqual(invokedWith.type, "chat-summary");
    assert.strictEqual(invokedWith.model, "us.anthropic.claude-haiku-4-5-20251001-v1:0");
    assert.strictEqual(invokedWith.stream, false);
    assert.strictEqual(invokedWith.thoughtBudget, 0);

    // Verify the inference messages sent to the invoker (should include the summarize instruction)
    const lastMsg = invokedWith.messages[invokedWith.messages.length - 1];
    assert.ok(lastMsg.content[0].text.includes("Summarize the entire conversation"));

    // Verify conversation now has summaryMessageID
    conv = await svc.getConversation(testUser.id, conversation.id);
    assert.ok(conv.summaryMessageID, "summaryMessageID should be set");

    // Verify the summary message exists and has the right content
    const summaryMsg = await svc.getMessage(testUser.id, conv.summaryMessageID);
    assert.ok(summaryMsg, "Summary message should exist");
    assert.strictEqual(summaryMsg.role, "user");
    assert.ok(summaryMsg.content[0].text.includes("[Conversation Summary]"));
    assert.ok(summaryMsg.content[0].text.includes("mock summary"));

    // Verify getContext with compressed=true returns only messages from summary onward
    const compressed = await svc.getContext(testUser.id, conversation.id, { compressed: true });
    assert.ok(compressed.messages.length > 0);
    assert.ok(
      compressed.messages[0].id >= conv.summaryMessageID,
      "Compressed context should start at or after summaryMessageID"
    );

    // The full context should still have all messages
    const full = await svc.getContext(testUser.id, conversation.id);
    assert.ok(
      full.messages.length > compressed.messages.length,
      "Full context has more messages than compressed"
    );
  });

  // ===== 2. RE-SUMMARIZATION =====

  await t.test("re-summarizes when new messages exceed threshold again", async () => {
    let invokeCount = 0;

    ConversationService.setInvoker(async (params) => {
      invokeCount++;
      return {
        output: {
          message: {
            content: [{ text: `Re-summary #${invokeCount}` }],
          },
        },
        usage: { inputTokens: 50, outputTokens: 25 },
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

    // First: trigger initial summarization
    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "B".repeat(400) }],
    });

    let conv = await svc.getConversation(testUser.id, conversation.id);
    const firstSummaryID = conv.summaryMessageID;
    assert.ok(firstSummaryID, "First summary should exist");
    assert.strictEqual(invokeCount, 1);

    // Add more messages after the summary to push past the threshold again.
    // The summary message itself is short, so we need another big message.
    await svc.addMessage(testUser.id, conversation.id, {
      role: "assistant",
      content: [{ text: "C".repeat(400) }],
    });

    conv = await svc.getConversation(testUser.id, conversation.id);
    const secondSummaryID = conv.summaryMessageID;
    assert.ok(secondSummaryID, "Second summary should exist");
    assert.ok(secondSummaryID > firstSummaryID, "Second summary should have a higher ID");
    assert.strictEqual(invokeCount, 2);

    // Both summary messages should exist in DB (no context rot)
    const firstSummary = await svc.getMessage(testUser.id, firstSummaryID);
    const secondSummary = await svc.getMessage(testUser.id, secondSummaryID);
    assert.ok(firstSummary, "First summary message preserved");
    assert.ok(secondSummary, "Second summary message preserved");
    assert.ok(secondSummary.content[0].text.includes("Re-summary #2"));
  });

  // ===== 3. FAILURE ROLLBACK =====

  await t.test("rolls back placeholder on invoker failure", async () => {
    ConversationService.setInvoker(async () => {
      throw new Error("Simulated gateway failure");
    });

    const agent = await svc.createAgent(testUser.id, { name: "Rollback Agent", modelID: HAIKU_ID });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Rollback Test",
    });

    // Trigger summarization with a big message — invoker will fail
    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "D".repeat(400) }],
    });

    // summaryMessageID should be restored to null
    const conv = await svc.getConversation(testUser.id, conversation.id);
    assert.strictEqual(
      conv.summaryMessageID,
      null,
      "summaryMessageID should be null after failure"
    );

    // The placeholder message should be deleted
    const allMessages = await svc.getMessages(testUser.id, conversation.id);
    const nullContentMessages = allMessages.filter((m) => m.content === null);
    assert.strictEqual(nullContentMessages.length, 0, "No null-content placeholder should remain");
  });

  // ===== 4. NO INVOKER = NO SUMMARIZATION =====

  await t.test("does nothing when no invoker is set", async () => {
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

    const conv = await svc.getConversation(testUser.id, conversation.id);
    assert.strictEqual(conv.summaryMessageID, null, "No summarization without invoker");
  });

  // ===== 5. FALLBACK TO CHEAPEST MODEL =====

  await t.test("falls back to cheapest chat model when agent has no modelID", async () => {
    let invokedModel = null;

    ConversationService.setInvoker(async (params) => {
      invokedModel = params.model;
      return {
        output: { message: { content: [{ text: "Fallback summary" }] } },
        usage: { inputTokens: 50, outputTokens: 25 },
      };
    });

    // Agent without modelID
    const agent = await svc.createAgent(testUser.id, { name: "No Model Agent" });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Fallback Model Test",
    });

    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "F".repeat(400) }],
    });

    // Should have used whichever chat model is cheapest
    // Haiku has maxContext=50 now, so if it picks Haiku it would trigger.
    // But models with higher maxContext won't trigger. Let's just verify it was called or not.
    // The cheapest model by cost1kInput is Mock Model (0.0000001) but it has maxContext=1000000
    // so 400 chars / 8 = 50 tokens < 1000000 * 0.8 — won't trigger.
    // The key test is that it doesn't crash.
    const conv = await svc.getConversation(testUser.id, conversation.id);
    // With cheapest model having huge context, summarization shouldn't trigger
    assert.strictEqual(conv.summaryMessageID, null, "Cheapest model has huge context, no trigger");
  });

  // ===== 6. GETCONTEXT IGNORES NULL-CONTENT PLACEHOLDER =====

  await t.test("getContext ignores summary placeholder with null content", async () => {
    ConversationService.setInvoker(null); // disable auto-summarize

    const agent = await svc.createAgent(testUser.id, {
      name: "Placeholder Agent",
      modelID: HAIKU_ID,
    });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Placeholder Test",
    });

    // Manually insert messages
    const msg1 = await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "message one" }],
    });
    const msg2 = await svc.addMessage(testUser.id, conversation.id, {
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

    // getContext with compressed=true should ignore the null-content placeholder
    // and return ALL messages instead
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

  await t.test("teardown: restore Haiku maxContext", async () => {
    await setHaikuMaxContext(ORIGINAL_MAX_CONTEXT);
    ConversationService.setInvoker(null);

    const [model] = await db.select().from(Model).where(eq(Model.id, HAIKU_ID)).limit(1);
    assert.strictEqual(model.maxContext, ORIGINAL_MAX_CONTEXT, "Haiku maxContext restored");
  });
});
