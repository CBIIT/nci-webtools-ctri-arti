import db, { Conversation, Message } from "database";

import { and, asc, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { routeHandler } from "shared/utils.js";

import { getAgentWithRelations } from "./agents.js";

const GATEWAY_URL = process.env.GATEWAY_URL;

const router = Router();

// POST /conversations — Create a new conversation
router.post(
  "/",
  routeHandler(async (req, res) => {
    const { agentID, messages } = req.body;
    if (!agentID || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "agentID and messages are required" });
    }

    const [conversation] = await db
      .insert(Conversation)
      .values({ userID: req.userId, agentID, title: "" })
      .returning();

    const records = messages.map((m) => ({
      conversationID: conversation.id,
      role: m.role,
      content: m.content,
    }));
    await db.insert(Message).values(records);

    const result = await getConversationWithMessages(req.userId, conversation.id);
    res.status(201).json(result);
  })
);

// GET /conversations — List conversations
router.get(
  "/",
  routeHandler(async (req, res) => {
    const conversations = await db
      .select()
      .from(Conversation)
      .where(and(eq(Conversation.userID, req.userId), eq(Conversation.deleted, false)))
      .orderBy(desc(Conversation.createdAt));

    res.json(
      conversations.map((c) => ({
        conversationID: c.id,
        agentID: c.agentID,
        userID: c.userID,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    );
  })
);

// GET /conversations/:id — Get conversation with messages
router.get(
  "/:id",
  routeHandler(async (req, res) => {
    const result = await getConversationWithMessages(req.userId, Number(req.params.id));
    if (!result) return res.status(404).json({ error: "Conversation not found" });
    res.json(result);
  })
);

// PUT /conversations/:id — Chat (orchestration endpoint)
router.put(
  "/:id",
  routeHandler(async (req, res) => {
    const conversationId = Number(req.params.id);
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Verify conversation exists and belongs to user
    const [conversation] = await db
      .select()
      .from(Conversation)
      .where(
        and(
          eq(Conversation.id, conversationId),
          eq(Conversation.userID, req.userId),
          eq(Conversation.deleted, false)
        )
      )
      .limit(1);

    if (!conversation) return res.status(404).json({ error: "Conversation not found" });

    // Save user message(s)
    const userMessages = messages.map((m) => ({
      conversationID: conversationId,
      role: m.role,
      content: m.content,
    }));
    await db.insert(Message).values(userMessages);

    // Resolve agent configuration
    const agent = await getAgentWithRelations(req.userId, conversation.agentID);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    // Fetch conversation history for context
    const history = await db
      .select()
      .from(Message)
      .where(eq(Message.conversationID, conversationId))
      .orderBy(asc(Message.createdAt));

    const chatMessages = history.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? [{ text: m.content }] : m.content,
    }));

    // Call gateway for inference
    const gatewayResponse = await callGateway({
      modelID: agent.modelID,
      userID: req.userId,
      agentID: conversation.agentID,
      messages: chatMessages,
      system: agent.systemPrompt ? [{ text: agent.systemPrompt }] : undefined,
    });

    if (gatewayResponse.error) {
      return res.status(502).json({ error: gatewayResponse.error });
    }

    // Extract assistant response and save it
    const assistantContent =
      gatewayResponse.output?.message?.content || gatewayResponse.content || [];
    await db
      .insert(Message)
      .values({
        conversationID: conversationId,
        role: "assistant",
        content: assistantContent,
      })
      .returning();

    // Update conversation title from first user message if empty
    if (!conversation.title) {
      const firstUserMsg = messages.find((m) => m.role === "user");
      const titleText =
        typeof firstUserMsg?.content === "string"
          ? firstUserMsg.content
          : firstUserMsg?.content?.[0]?.text || "";
      const title = titleText.slice(0, 100);
      if (title) {
        await db.update(Conversation).set({ title }).where(eq(Conversation.id, conversationId));
      }
    }

    const result = await getConversationWithMessages(req.userId, conversationId);
    res.json(result);
  })
);

// DELETE /conversations/:id — Soft delete
router.delete(
  "/:id",
  routeHandler(async (req, res) => {
    const result = await db
      .update(Conversation)
      .set({ deleted: true, deletedAt: new Date() })
      .where(and(eq(Conversation.id, Number(req.params.id)), eq(Conversation.userID, req.userId)))
      .returning();

    if (result.length === 0) return res.status(404).json({ error: "Conversation not found" });
    res.json({ success: true });
  })
);

// Helper: fetch conversation with its messages
async function getConversationWithMessages(userId, conversationId) {
  const [conversation] = await db
    .select()
    .from(Conversation)
    .where(
      and(
        eq(Conversation.id, conversationId),
        eq(Conversation.userID, userId),
        eq(Conversation.deleted, false)
      )
    )
    .limit(1);

  if (!conversation) return null;

  const messages = await db
    .select()
    .from(Message)
    .where(eq(Message.conversationID, conversationId))
    .orderBy(asc(Message.createdAt));

  return {
    conversationID: conversation.id,
    agentID: conversation.agentID,
    userID: conversation.userID,
    title: conversation.title,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

// Helper: call gateway for inference (factory pattern)
async function callGateway({ modelID, userID, agentID, messages, system }) {
  if (GATEWAY_URL) {
    const response = await fetch(`${GATEWAY_URL}/api/v1/modelInvoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "chat",
        modelID,
        userID,
        agentID,
        messages,
        system,
        type: "chat",
      }),
    });
    return response.json();
  }

  // Monolith mode: direct import
  const { runModel } = await import("gateway/chat.js");
  const { trackModelUsage } = await import("gateway/usage.js");
  const { Model } = await import("database");

  const model = await db.query.Model.findFirst({
    where: eq(Model.id, modelID),
    with: { Provider: true },
  });
  if (!model) return { error: `Model not found: ${modelID}` };

  const result = await runModel({ model, messages, system });
  if (userID) {
    await trackModelUsage(userID, model, result.usage, { type: "chat", agentID });
  }
  return result;
}

export default router;
