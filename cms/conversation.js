import db, {
  Agent,
  Conversation,
  Message,
  Model,
  Resource,
  Vector,
  Prompt,
  Tool,
  AgentTool,
  UserTool,
} from "database";

import { eq, and, or, isNull, isNotNull, inArray, gte, asc, desc } from "drizzle-orm";

let _invoke = null;
const _summarizing = new Set();

function estimateMessageTokens(messages) {
  let tokens = 0;
  for (const msg of messages) {
    for (const c of msg.content || []) {
      if (c.text) tokens += Math.ceil(c.text.length / 8);
      if (c.document?.source?.text) tokens += Math.ceil(c.document.source.text.length / 8);
      if (c.document?.source?.bytes) tokens += Math.ceil(c.document.source.bytes.length / 3);
      if (c.image?.source?.bytes) tokens += Math.ceil(c.image.source.bytes.length / 3);
      if (c.toolUse) tokens += Math.ceil(JSON.stringify(c.toolUse).length / 8);
      if (c.toolResult) tokens += Math.ceil(JSON.stringify(c.toolResult).length / 8);
    }
  }
  return tokens;
}

function stripAutoFields(obj) {
  const { id, createdAt, updatedAt, ...rest } = obj;
  return rest;
}

export class ConversationService {
  static setInvoker(fn) {
    _invoke = fn;
  }

  async #getSummarizationModel(conversation) {
    // Try to get model via conversation → agent → Model
    if (conversation.agentID) {
      const agent = await db.query.Agent.findFirst({
        where: eq(Agent.id, conversation.agentID),
        with: { Model: true },
      });
      if (agent?.Model) return agent.Model;
    }
    // Fallback to cheapest chat model
    const models = await db.select().from(Model).where(eq(Model.type, "chat"));
    if (!models.length) return null;
    return models.reduce((cheapest, m) =>
      (m.cost1kInput || Infinity) < (cheapest.cost1kInput || Infinity) ? m : cheapest
    );
  }

  async #maybeSummarize(userId, conversationId) {
    if (!_invoke || _summarizing.has(conversationId)) return;
    _summarizing.add(conversationId);

    try {
      const conversation = await this.getConversation(userId, conversationId);
      if (!conversation) return;

      const model = await this.#getSummarizationModel(conversation);
      if (!model?.internalName || !model?.maxContext) return;

      // Load inference messages
      let messages;
      if (conversation.summaryMessageID) {
        const summaryMsg = await this.getMessage(userId, conversation.summaryMessageID);
        if (summaryMsg?.content) {
          messages = await db
            .select()
            .from(Message)
            .where(
              and(
                eq(Message.conversationID, conversationId),
                gte(Message.id, conversation.summaryMessageID)
              )
            )
            .orderBy(asc(Message.createdAt));
        }
      }
      if (!messages) {
        messages = await db
          .select()
          .from(Message)
          .where(eq(Message.conversationID, conversationId))
          .orderBy(asc(Message.createdAt));
      }

      const estimated = estimateMessageTokens(messages);
      if (estimated < model.maxContext * 0.8) return;

      // Insert placeholder message
      const [placeholder] = await db
        .insert(Message)
        .values({
          conversationID: conversationId,
          role: "user",
          content: null,
        })
        .returning();

      // Set summaryMessageID to placeholder
      await db
        .update(Conversation)
        .set({ summaryMessageID: placeholder.id })
        .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)));

      try {
        const summarizeInstruction = {
          role: "user",
          content: [
            {
              text:
                "Summarize the entire conversation so far. Include all key decisions, " +
                "requirements, code, facts, and context needed to continue without the " +
                "original messages. Be thorough but concise. Format as structured notes.",
            },
          ],
        };

        const inferenceMessages = messages
          .filter((m) => m.content)
          .map(({ role, content }) => ({ role, content }));

        const result = await _invoke({
          userID: userId,
          model: model.internalName,
          messages: [...inferenceMessages, summarizeInstruction],
          system: "You are summarizing a conversation for context compression.",
          thoughtBudget: 0,
          stream: false,
          type: "chat-summary",
        });

        const summaryText = result?.output?.message?.content?.[0]?.text;
        if (summaryText) {
          await db
            .update(Message)
            .set({ content: [{ text: `[Conversation Summary]\n\n${summaryText}` }] })
            .where(eq(Message.id, placeholder.id));
        } else {
          throw new Error("No summary text returned");
        }
      } catch (error) {
        console.error("Summarization failed, removing placeholder:", error);
        await db.delete(Message).where(eq(Message.id, placeholder.id));
        await db
          .update(Conversation)
          .set({ summaryMessageID: conversation.summaryMessageID || null })
          .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)));
      }
    } finally {
      _summarizing.delete(conversationId);
    }
  }

  // ===== AGENT METHODS =====

  async createAgent(userId, data) {
    const [agent] = await db
      .insert(Agent)
      .values({
        userID: userId,
        name: data.name,
        description: data.description || null,
        modelID: data.modelID || null,
        promptID: data.promptID || null,
        modelParameters: data.modelParameters || null,
      })
      .returning();

    // Sync AgentTool junction table when tools array is provided
    if (Array.isArray(data.tools) && data.tools.length > 0) {
      const toolRecords = await db.select().from(Tool).where(inArray(Tool.name, data.tools));
      const agentTools = toolRecords.map((t) => ({ agentID: agent.id, toolID: t.id }));
      if (agentTools.length) await db.insert(AgentTool).values(agentTools);
    }

    return agent;
  }

  async getAgent(userId, agentId) {
    const agent = await db.query.Agent.findFirst({
      where: and(eq(Agent.id, agentId), or(eq(Agent.userID, userId), isNull(Agent.userID))),
      with: {
        Prompt: { columns: { id: true, name: true, content: true } },
        AgentTools: { with: { Tool: { columns: { name: true } } } },
      },
    });

    if (!agent) return null;

    const result = { ...agent };
    result.systemPrompt = result.Prompt?.content || null;
    result.tools = (result.AgentTools || []).map((at) => at.Tool?.name).filter(Boolean);
    return result;
  }

  async getAgents(userId) {
    const agents = await db.query.Agent.findMany({
      where: or(eq(Agent.userID, userId), isNull(Agent.userID)),
      with: {
        Prompt: { columns: { id: true, name: true, content: true } },
        AgentTools: { with: { Tool: { columns: { name: true } } } },
      },
      orderBy: desc(Agent.createdAt),
    });

    return agents.map((agent) => {
      const result = { ...agent };
      result.systemPrompt = result.Prompt?.content || null;
      result.tools = (result.AgentTools || []).map((at) => at.Tool?.name).filter(Boolean);
      return result;
    });
  }

  async updateAgent(userId, agentId, updates) {
    const { tools, ...agentFields } = updates;
    const result = await db
      .update(Agent)
      .set(stripAutoFields(agentFields))
      .where(and(eq(Agent.id, agentId), eq(Agent.userID, userId)))
      .returning();
    if (result.length === 0) return null;

    // Sync AgentTool junction table when tools array is provided
    if (Array.isArray(tools)) {
      await db.delete(AgentTool).where(eq(AgentTool.agentID, agentId));
      const toolRecords = await db.select().from(Tool).where(inArray(Tool.name, tools));
      const agentTools = toolRecords.map((t) => ({ agentID: agentId, toolID: t.id }));
      if (agentTools.length) await db.insert(AgentTool).values(agentTools);
    }

    return this.getAgent(userId, agentId);
  }

  async deleteAgent(userId, agentId) {
    const conversations = await db
      .select()
      .from(Conversation)
      .where(and(eq(Conversation.agentID, agentId), eq(Conversation.userID, userId)));
    for (const conversation of conversations) {
      await this.deleteConversation(userId, conversation.id);
    }
    const result = await db
      .delete(Agent)
      .where(and(eq(Agent.id, agentId), eq(Agent.userID, userId)));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== CONVERSATION METHODS =====

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
  }

  async getConversation(userId, conversationId) {
    const result = await db.query.Conversation.findFirst({
      where: and(
        eq(Conversation.id, conversationId),
        eq(Conversation.userID, userId),
        eq(Conversation.deleted, false)
      ),
    });
    return result || null;
  }

  async getConversations(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const where = and(eq(Conversation.userID, userId), eq(Conversation.deleted, false));

    const [rows, [{ value: countVal }]] = await Promise.all([
      db
        .select()
        .from(Conversation)
        .where(where)
        .orderBy(desc(Conversation.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ value: (await import("drizzle-orm")).count() })
        .from(Conversation)
        .where(where),
    ]);

    return { count: countVal, rows };
  }

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
  }

  async deleteConversation(userId, conversationId) {
    await db.delete(Vector).where(eq(Vector.conversationID, conversationId));
    await db.delete(Message).where(eq(Message.conversationID, conversationId));
    const result = await db
      .delete(Conversation)
      .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== CONTEXT METHOD =====

  async getContext(userId, conversationId, { compressed = false } = {}) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    let messages;
    if (compressed && conversation.summaryMessageID) {
      // Only use summary if its content is not null (placeholder not yet filled)
      const summaryMsg = await db
        .select()
        .from(Message)
        .where(eq(Message.id, conversation.summaryMessageID))
        .limit(1);
      if (summaryMsg[0]?.content) {
        messages = await db
          .select()
          .from(Message)
          .where(
            and(
              eq(Message.conversationID, conversationId),
              gte(Message.id, conversation.summaryMessageID)
            )
          )
          .orderBy(asc(Message.createdAt));
      }
    }

    if (!messages) {
      messages = await db
        .select()
        .from(Message)
        .where(eq(Message.conversationID, conversationId))
        .orderBy(asc(Message.createdAt));
    }

    const messageIds = messages.map((m) => m.id);
    const resources = messageIds.length
      ? await db
          .select()
          .from(Resource)
          .where(inArray(Resource.messageID, messageIds))
          .orderBy(asc(Resource.createdAt))
      : [];

    return { conversation, messages, resources };
  }

  // ===== MESSAGE METHODS =====

  async addMessage(userId, conversationId, data) {
    const [msg] = await db
      .insert(Message)
      .values({
        conversationID: conversationId,
        parentID: data.parentID || null,
        role: data.role,
        content: data.content,
      })
      .returning();
    await this.#maybeSummarize(userId, conversationId);
    return msg;
  }

  async getMessages(userId, conversationId) {
    return db
      .select()
      .from(Message)
      .where(eq(Message.conversationID, conversationId))
      .orderBy(asc(Message.createdAt));
  }

  async getMessage(userId, messageId) {
    const [msg] = await db.select().from(Message).where(eq(Message.id, messageId)).limit(1);
    return msg || null;
  }

  async updateMessage(userId, messageId, updates) {
    const result = await db
      .update(Message)
      .set(stripAutoFields(updates))
      .where(eq(Message.id, messageId))
      .returning();
    if (result.length === 0) return null;
    return this.getMessage(userId, messageId);
  }

  async deleteMessage(userId, messageId) {
    const result = await db.delete(Message).where(eq(Message.id, messageId));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== TOOL METHODS =====

  async createTool(data) {
    const [tool] = await db.insert(Tool).values(data).returning();
    return tool;
  }

  async getTool(toolId) {
    const [tool] = await db.select().from(Tool).where(eq(Tool.id, toolId)).limit(1);
    return tool || null;
  }

  async getTools(userId) {
    const builtinTools = await db.select().from(Tool).where(eq(Tool.type, "builtin"));
    if (!userId) return builtinTools;

    const userTools = await db.query.Tool.findMany({
      with: { UserTools: true },
    });
    const filteredUserTools = userTools.filter(
      (t) => t.type !== "builtin" && t.UserTools?.some((ut) => ut.userID === userId)
    );
    return [...builtinTools, ...filteredUserTools];
  }

  async updateTool(toolId, updates) {
    const result = await db
      .update(Tool)
      .set(stripAutoFields(updates))
      .where(eq(Tool.id, toolId))
      .returning();
    if (result.length === 0) return null;
    return this.getTool(toolId);
  }

  async deleteTool(toolId) {
    await db.delete(Vector).where(eq(Vector.toolID, toolId));
    await db.delete(AgentTool).where(eq(AgentTool.toolID, toolId));
    await db.delete(UserTool).where(eq(UserTool.toolID, toolId));
    const result = await db.delete(Tool).where(eq(Tool.id, toolId));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== PROMPT METHODS =====

  async createPrompt(data) {
    const [prompt] = await db.insert(Prompt).values(data).returning();
    return prompt;
  }

  async getPrompt(promptId) {
    const [prompt] = await db.select().from(Prompt).where(eq(Prompt.id, promptId)).limit(1);
    return prompt || null;
  }

  async getPrompts(options = {}) {
    return db.select().from(Prompt).orderBy(asc(Prompt.name), desc(Prompt.version));
  }

  async updatePrompt(promptId, updates) {
    const result = await db
      .update(Prompt)
      .set(stripAutoFields(updates))
      .where(eq(Prompt.id, promptId))
      .returning();
    if (result.length === 0) return null;
    return this.getPrompt(promptId);
  }

  async deletePrompt(promptId) {
    const result = await db.delete(Prompt).where(eq(Prompt.id, promptId));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== RESOURCE METHODS =====

  async addResource(userId, data) {
    const [resource] = await db
      .insert(Resource)
      .values({
        agentID: data.agentID || null,
        messageID: data.messageID || null,
        name: data.name,
        type: data.type,
        content: data.content,
        s3Uri: data.s3Uri || null,
        metadata: data.metadata || {},
      })
      .returning();
    return resource;
  }

  async getResource(userId, resourceId) {
    const [resource] = await db.select().from(Resource).where(eq(Resource.id, resourceId)).limit(1);
    return resource || null;
  }

  async getResourcesByAgent(userId, agentId) {
    return db
      .select()
      .from(Resource)
      .where(eq(Resource.agentID, agentId))
      .orderBy(asc(Resource.createdAt));
  }

  async deleteResource(userId, resourceId) {
    await db.delete(Vector).where(eq(Vector.resourceID, resourceId));
    const result = await db.delete(Resource).where(eq(Resource.id, resourceId));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== VECTOR METHODS =====

  async addVectors(userId, conversationId, vectors) {
    const records = vectors.map((vector, index) => ({
      conversationID: conversationId,
      resourceID: vector.resourceID || null,
      toolID: vector.toolID || null,
      order: vector.order ?? index,
      content: vector.content,
      embedding: vector.embedding || null,
    }));
    return db.insert(Vector).values(records).returning();
  }

  async getVectorsByConversation(userId, conversationId) {
    return db
      .select()
      .from(Vector)
      .where(eq(Vector.conversationID, conversationId))
      .orderBy(asc(Vector.order));
  }

  async getVectorsByResource(userId, resourceId) {
    return db
      .select()
      .from(Vector)
      .where(eq(Vector.resourceID, resourceId))
      .orderBy(asc(Vector.order));
  }

  async searchVectors({ toolID, conversationID, embedding, topN = 10 }) {
    const conditions = [];
    if (toolID) conditions.push(eq(Vector.toolID, toolID));
    if (conversationID) conditions.push(eq(Vector.conversationID, conversationID));
    conditions.push(isNotNull(Vector.embedding));

    const where = and(...conditions);
    const vectors = await db.select().from(Vector).where(where);

    if (!embedding || !vectors.length) return vectors;

    // Cosine similarity search
    const scored = vectors.map((v) => {
      const stored = v.embedding;
      let dotProduct = 0,
        normA = 0,
        normB = 0;
      for (let i = 0; i < embedding.length; i++) {
        dotProduct += embedding[i] * (stored[i] || 0);
        normA += embedding[i] * embedding[i];
        normB += (stored[i] || 0) * (stored[i] || 0);
      }
      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
      return { ...v, similarity };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topN);
  }

  async deleteVectorsByConversation(userId, conversationId) {
    const result = await db.delete(Vector).where(eq(Vector.conversationID, conversationId));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }
}

export const conversationService = new ConversationService();
