import db, { Agent, Conversation, Message, Model, Resource } from "database";

import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";

import {
  getMutationCount,
  hasOwn,
  requireConversation,
  stripAutoFields,
  validateConversationMessage,
} from "./shared.js";

const summarizingConversationIds = new Set();
const CONVERSATION_SUMMARY_TOKEN = "[Conversation Summary]";

function estimateMessageTokens(messages) {
  let tokens = 0;
  for (const message of messages) {
    for (const contentBlock of message.content || []) {
      if (contentBlock.text) tokens += Math.ceil(contentBlock.text.length / 8);
      if (contentBlock.document?.source?.text) {
        tokens += Math.ceil(contentBlock.document.source.text.length / 8);
      }
      if (contentBlock.document?.source?.bytes) {
        tokens += Math.ceil(contentBlock.document.source.bytes.length / 3);
      }
      if (contentBlock.image?.source?.bytes) {
        tokens += Math.ceil(contentBlock.image.source.bytes.length / 3);
      }
      if (contentBlock.toolUse) {
        tokens += Math.ceil(JSON.stringify(contentBlock.toolUse).length / 8);
      }
      if (contentBlock.toolResult) {
        tokens += Math.ceil(JSON.stringify(contentBlock.toolResult).length / 8);
      }
    }
  }
  return tokens;
}

async function getSummarizationModel(conversation) {
  if (conversation.agentID) {
    const agent = await db.query.Agent.findFirst({
      where: eq(Agent.id, conversation.agentID),
      with: { Model: true },
    });
    if (agent?.Model) return agent.Model;
  }

  return (
    (await db.query.Model.findFirst({
      where: eq(Model.internalName, "us.anthropic.claude-sonnet-4-6"),
    })) || null
  );
}

async function getConversationMessages(conversationId, { summaryMessageId = null } = {}) {
  if (summaryMessageId) {
    return db
      .select()
      .from(Message)
      .where(and(eq(Message.conversationID, conversationId), gte(Message.id, summaryMessageId)))
      .orderBy(asc(Message.id));
  }

  return db
    .select()
    .from(Message)
    .where(eq(Message.conversationID, conversationId))
    .orderBy(asc(Message.id));
}

export const conversationMethods = {
  async checkSummarizationNeeded(userId, conversationId) {
    if (summarizingConversationIds.has(conversationId)) return null;

    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    const model = await getSummarizationModel(conversation);
    if (!model?.internalName || !model?.maxContext) return null;

    let messages;
    if (conversation.summaryMessageID) {
      const summaryMessage = await this.getMessage(userId, conversation.summaryMessageID);
      if (summaryMessage?.content) {
        messages = await getConversationMessages(conversationId, {
          summaryMessageId: conversation.summaryMessageID,
        });
      }
    }

    if (!messages) {
      messages = await getConversationMessages(conversationId);
    }

    const estimated = estimateMessageTokens(messages);
    if (estimated < model.maxContext * 0.8) return null;

    return {
      model: model.internalName,
      messages: messages
        .filter((message) => message.content)
        .map(({ role, content }) => ({ role, content })),
    };
  },

  async persistSummary(userId, conversationId, summaryText) {
    summarizingConversationIds.add(conversationId);
    try {
      const persistedSummaryText = summaryText.startsWith(CONVERSATION_SUMMARY_TOKEN)
        ? summaryText
        : `${CONVERSATION_SUMMARY_TOKEN}\n\n${summaryText}`;
      const [summaryMessage] = await db
        .insert(Message)
        .values({
          conversationID: conversationId,
          role: "user",
          content: [{ text: persistedSummaryText }],
        })
        .returning();

      await db
        .update(Conversation)
        .set({ summaryMessageID: summaryMessage.id })
        .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)));

      return summaryMessage;
    } finally {
      summarizingConversationIds.delete(conversationId);
    }
  },

  async createConversation(userId, data) {
    const [conversation] = await db
      .insert(Conversation)
      .values({
        userID: userId,
        agentID: data.agentID || null,
        title: data.title || "",
      })
      .returning();
    return conversation;
  },

  async getConversation(userId, conversationId) {
    const conversation = await db.query.Conversation.findFirst({
      where: and(
        eq(Conversation.id, conversationId),
        eq(Conversation.userID, userId),
        eq(Conversation.deleted, false)
      ),
    });
    return conversation || null;
  },

  async getConversations(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const where = and(eq(Conversation.userID, userId), eq(Conversation.deleted, false));

    const [rows, [{ value: countValue }]] = await Promise.all([
      db
        .select()
        .from(Conversation)
        .where(where)
        .orderBy(desc(Conversation.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(Conversation).where(where),
    ]);

    return { count: countValue, rows };
  },

  async updateConversation(userId, conversationId, updates) {
    const result = await db
      .update(Conversation)
      .set(stripAutoFields(updates))
      .where(
        and(
          eq(Conversation.id, conversationId),
          eq(Conversation.userID, userId),
          eq(Conversation.deleted, false)
        )
      )
      .returning();
    if (result.length === 0) return null;
    return this.getConversation(userId, conversationId);
  },

  async deleteConversation(userId, conversationId) {
    const result = await db
      .update(Conversation)
      .set({ deleted: true, deletedAt: new Date() })
      .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)));
    return getMutationCount(result);
  },

  async getContext(userId, conversationId, { compressed = false } = {}) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    let messages;
    if (compressed && conversation.summaryMessageID) {
      const [summaryMessage] = await db
        .select()
        .from(Message)
        .where(eq(Message.id, conversation.summaryMessageID))
        .limit(1);
      const summaryText = summaryMessage?.content?.[0]?.text || "";
      if (summaryMessage?.content && summaryText.length >= 50) {
        messages = await getConversationMessages(conversationId, {
          summaryMessageId: conversation.summaryMessageID,
        });
      }
    }

    if (!messages) {
      messages = await getConversationMessages(conversationId);
    }

    const messageIds = messages.map((message) => message.id);
    const resources = messageIds.length
      ? await db
          .select()
          .from(Resource)
          .where(inArray(Resource.messageID, messageIds))
          .orderBy(asc(Resource.createdAt))
      : [];

    return { conversation, messages, resources };
  },

  async appendConversationMessage(userId, { conversationId, role, content, parentID = null }) {
    await requireConversation(this, userId, conversationId);
    validateConversationMessage(role, content);

    const [message] = await db
      .insert(Message)
      .values({
        conversationID: conversationId,
        parentID,
        role,
        content,
      })
      .returning();
    return message;
  },

  async appendUserMessage(userId, { conversationId, content, parentID = null }) {
    return this.appendConversationMessage(userId, {
      conversationId,
      role: "user",
      content,
      parentID,
    });
  },

  async appendAssistantMessage(userId, { conversationId, content, parentID = null }) {
    return this.appendConversationMessage(userId, {
      conversationId,
      role: "assistant",
      content,
      parentID,
    });
  },

  async appendToolResultsMessage(userId, { conversationId, content, parentID = null }) {
    return this.appendConversationMessage(userId, {
      conversationId,
      role: "user",
      content,
      parentID,
    });
  },

  async *summarize(
    userId,
    conversationId,
    { model, system, tools, thoughtBudget, userText, requestId } = {}
  ) {
    if (!this.invokeModel) return;

    const check = await this.checkSummarizationNeeded(userId, conversationId);
    if (!check) return;

    const summaryPrompt =
      "Summarize the entire conversation so far. Include all key decisions, " +
      "requirements, code, facts, and context needed to continue without the " +
      "original messages. Be thorough but concise. Format as structured notes.\n\n" +
      `Begin your response with exactly "${CONVERSATION_SUMMARY_TOKEN}" on its own line, ` +
      "followed by a blank line.\n\n" +
      "If there are uploaded files or resources referenced in the conversation, " +
      "include a section listing them and note that the editor tool can be used " +
      "to read their contents if needed.\n\n" +
      "End the summary with the user's latest message quoted verbatim, and an " +
      "instruction for the assistant to continue answering it:\n\n" +
      "## Latest User Message\n> " +
      (userText || "") +
      "\n\n" +
      "Continue addressing this message in your next response.";

    const result = await this.invokeModel({
      type: "chat-summary",
      model: model || check.model,
      stream: true,
      thoughtBudget: thoughtBudget ?? 0,
      requestId,
      system,
      tools,
      messages: [...check.messages, { role: "user", content: [{ text: summaryPrompt }] }],
    });

    let summaryText = "";
    for await (const chunk of result.stream) {
      yield chunk;
      if (chunk.contentBlockDelta?.delta?.text) {
        summaryText += chunk.contentBlockDelta.delta.text;
      }
    }

    if (summaryText.length >= 50) {
      await this.persistSummary(userId, conversationId, summaryText);
    }
  },

  async getMessages(userId, conversationId) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return [];

    return db
      .select()
      .from(Message)
      .where(eq(Message.conversationID, conversationId))
      .orderBy(asc(Message.id));
  },

  async getMessage(userId, messageId) {
    const [message] = await db.select().from(Message).where(eq(Message.id, messageId)).limit(1);
    if (!message) return null;

    const conversation = await this.getConversation(userId, message.conversationID);
    return conversation ? message : null;
  },

  async updateMessage(userId, messageId, updates) {
    const existing = await this.getMessage(userId, messageId);
    if (!existing) return null;

    const nextRole = hasOwn(updates, "role") ? updates.role : existing.role;
    const nextContent = hasOwn(updates, "content") ? updates.content : existing.content;
    validateConversationMessage(nextRole, nextContent);

    const result = await db
      .update(Message)
      .set(stripAutoFields(updates))
      .where(eq(Message.id, messageId))
      .returning();
    if (result.length === 0) return null;
    return this.getMessage(userId, messageId);
  },

  async deleteMessage(userId, messageId) {
    const existing = await this.getMessage(userId, messageId);
    if (!existing) return 0;

    const result = await db.delete(Message).where(eq(Message.id, messageId));
    return getMutationCount(result);
  },
};
