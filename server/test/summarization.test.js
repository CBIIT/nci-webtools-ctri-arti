import db, { User, Model, Conversation, Message } from "database";
import assert from "node:assert";
import { test } from "node:test";

import { ConversationService } from "cms/conversation.js";
import { eq } from "drizzle-orm";

const HAIKU_ID = 3; // Haiku model from seed data
const SONNET_ID = 2; // Sonnet model from seed data
const ORIGINAL_HAIKU_MAX_CONTEXT = 200000;
const ORIGINAL_SONNET_MAX_CONTEXT = 1000000;
const TINY_MAX_CONTEXT = 50; // ~40 token threshold (50 * 0.8), ~320 chars of text

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

  // ===== 1. SUMMARIZATION TRIGGERS WHEN TOKENS EXCEED 80% =====

  await t.test("triggers summarization when tokens exceed 80% of maxContext", async () => {
    let invokedWith = null;

    ConversationService.setInvoker(async (params) => {
      invokedWith = params;
      return {
        output: {
          message: {
            content: [
              {
                text: "This is the mock summary of the conversation including all key decisions and context needed to continue.",
              },
            ],
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
            content: [
              {
                text: `Re-summary #${invokeCount}: comprehensive conversation summary with all key decisions and requirements preserved.`,
              },
            ],
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
    assert.ok(secondSummary.content[0].text.includes("Re-summary #2:"));
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

  // ===== 5. DEFAULTS TO SONNET WHEN AGENT HAS NO MODEL =====

  await t.test("defaults to Sonnet when agent has no modelID", async () => {
    let invokedModel = null;

    ConversationService.setInvoker(async (params) => {
      invokedModel = params.model;
      return {
        output: {
          message: {
            content: [
              {
                text: "Sonnet default summary with enough content to pass the minimum length validation for summaries.",
              },
            ],
          },
        },
        usage: { inputTokens: 50, outputTokens: 25 },
      };
    });

    // Agent without modelID — should default to Sonnet for summarization
    const agent = await svc.createAgent(testUser.id, { name: "No Model Agent" });
    const conversation = await svc.createConversation(testUser.id, {
      agentID: agent.id,
      title: "Default Model Test",
    });

    await svc.addMessage(testUser.id, conversation.id, {
      role: "user",
      content: [{ text: "F".repeat(400) }],
    });

    // Sonnet's context is also shrunk to TINY_MAX_CONTEXT, so summarization triggers
    assert.strictEqual(invokedModel, "us.anthropic.claude-sonnet-4-6", "Should default to Sonnet");
    const conv = await svc.getConversation(testUser.id, conversation.id);
    assert.ok(conv.summaryMessageID, "Summary should exist using Sonnet default");
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
