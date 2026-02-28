import db, {
  Agent,
  Conversation,
  Message,
  Resource,
  Vector,
  Prompt,
  Tool,
  AgentTool,
  UserTool,
} from "database";

import { eq, and, or, isNull, isNotNull, inArray, asc, desc } from "drizzle-orm";

export class ConversationService {
  // ===== AGENT METHODS =====

  async createAgent(userId, data) {
    const [agent] = await db
      .insert(Agent)
      .values({
        userID: userId,
        name: data.name,
        description: data.description || null,
        promptID: data.promptID || null,
        modelParameters: data.modelParameters || null,
      })
      .returning();
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
      .set(agentFields)
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
      .set(updates)
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
    // Soft delete
    const result = await db
      .update(Conversation)
      .set({ deleted: true, deletedAt: new Date() })
      .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)))
      .returning();
    return result.length;
  }

  // ===== CONTEXT METHOD =====

  async getContext(userId, conversationId) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    const messages = await db
      .select()
      .from(Message)
      .where(eq(Message.conversationID, conversationId))
      .orderBy(asc(Message.createdAt));
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

  // ===== COMPRESS METHOD =====

  async compressConversation(userId, conversationId, { summary, summaryMessageID }) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    await db
      .update(Conversation)
      .set({ summaryMessageID })
      .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)));

    return this.getConversation(userId, conversationId);
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
      .set(updates)
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
    const result = await db.update(Tool).set(updates).where(eq(Tool.id, toolId)).returning();
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
    const result = await db.update(Prompt).set(updates).where(eq(Prompt.id, promptId)).returning();
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
