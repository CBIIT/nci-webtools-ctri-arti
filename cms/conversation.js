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

import { eq, and, or, isNull, isNotNull, inArray, gte, lte, asc, desc, sql } from "drizzle-orm";
import { chunkText } from "shared/chunker.js";
import { embed as gatewayEmbed } from "shared/clients/gateway.js";
import {
  assertValidEmbedding,
  getEmbeddingsFromResult,
  NOVA_EMBEDDING_MODEL,
  NOVA_INDEX_PURPOSE,
  RESOURCE_CHUNK_OVERLAP,
  RESOURCE_CHUNK_SIZE,
} from "shared/embeddings.js";

let _invoke = null;
let _embed = gatewayEmbed;
const _summarizing = new Set();
const CONVERSATION_SUMMARY_TOKEN = "[Conversation Summary]";

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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export class ConversationService {
  static setInvoker(fn) {
    _invoke = fn;
  }

  static setEmbedder(fn) {
    _embed = fn;
  }

  #isTextResource(resource) {
    const encoding = resource?.metadata?.encoding;
    return (
      resource?.type !== "image" &&
      typeof resource.content === "string" &&
      resource.content.length > 0 &&
      encoding !== "base64"
    );
  }

  #resourceReadCondition(userId) {
    return userId === null || userId === undefined
      ? isNull(Resource.userID)
      : or(eq(Resource.userID, userId), isNull(Resource.userID));
  }

  #resourceWriteCondition(userId) {
    return eq(Resource.userID, userId);
  }

  async #buildResourceVectors(userId, resource) {
    if (this.#isTextResource(resource)) {
      const chunks = chunkText(resource.content, {
        chunkSize: RESOURCE_CHUNK_SIZE,
        chunkOverlap: RESOURCE_CHUNK_OVERLAP,
      })
        .map((chunk) => chunk.trim())
        .filter(Boolean);

      if (!chunks.length) return [];

      const result = await _embed({
        userID: userId,
        model: NOVA_EMBEDDING_MODEL,
        content: chunks,
        purpose: NOVA_INDEX_PURPOSE,
        type: "embedding",
      });
      const embeddings = getEmbeddingsFromResult(result, { expectedCount: chunks.length });

      return chunks.map((content, index) => ({
        conversationID: resource.conversationID || null,
        content,
        embedding: embeddings[index],
        order: index,
      }));
    }

    if (resource?.type === "image" && typeof resource.content === "string" && resource.content) {
      const result = await _embed({
        userID: userId,
        model: NOVA_EMBEDDING_MODEL,
        content: [{ image: resource.content }],
        purpose: NOVA_INDEX_PURPOSE,
        type: "embedding",
      });
      const [embedding] = getEmbeddingsFromResult(result, { expectedCount: 1 });

      return [
        {
          conversationID: resource.conversationID || null,
          content: `[Image: ${resource.name}]`,
          embedding,
          order: 0,
        },
      ];
    }

    return [];
  }

  #shouldReindexResource(existing, updates) {
    if (!existing) return true;
    return (
      (hasOwn(updates, "content") && updates.content !== existing.content) ||
      (hasOwn(updates, "type") && updates.type !== existing.type) ||
      (hasOwn(updates, "conversationID") && updates.conversationID !== existing.conversationID) ||
      (hasOwn(updates, "metadata") &&
        JSON.stringify(updates.metadata || {}) !== JSON.stringify(existing.metadata || {}))
    );
  }

  async reindexResource(userId, resourceId) {
    const resource = await this.getResource(userId, resourceId);
    if (!resource) return null;

    const vectors = await this.#buildResourceVectors(userId, resource);
    await db.transaction(async (tx) => {
      await tx.delete(Vector).where(eq(Vector.resourceID, resourceId));
      if (vectors.length) {
        await tx.insert(Vector).values(
          vectors.map((vector) => ({
            ...vector,
            resourceID: resourceId,
          }))
        );
      }
    });

    return this.getVectorsByResource(userId, resourceId);
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
    // Default to Sonnet for summarization
    const sonnet = await db.query.Model.findFirst({
      where: eq(Model.internalName, "us.anthropic.claude-sonnet-4-6"),
    });
    return sonnet || null;
  }

  async checkSummarizationNeeded(userId, conversationId) {
    if (_summarizing.has(conversationId)) return null;

    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    const model = await this.#getSummarizationModel(conversation);
    if (!model?.internalName || !model?.maxContext) return null;

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
          .orderBy(asc(Message.id));
      }
    }
    if (!messages) {
      messages = await db
        .select()
        .from(Message)
        .where(eq(Message.conversationID, conversationId))
        .orderBy(asc(Message.id));
    }

    const estimated = estimateMessageTokens(messages);
    if (estimated < model.maxContext * 0.8) return null;

    return {
      model: model.internalName,
      messages: messages.filter((m) => m.content).map(({ role, content }) => ({ role, content })),
    };
  }

  async persistSummary(userId, conversationId, summaryText) {
    _summarizing.add(conversationId);
    try {
      const persistedSummaryText = summaryText.startsWith(CONVERSATION_SUMMARY_TOKEN)
        ? summaryText
        : `${CONVERSATION_SUMMARY_TOKEN}\n\n${summaryText}`;
      const [summaryMsg] = await db
        .insert(Message)
        .values({
          conversationID: conversationId,
          role: "user",
          content: [{ text: persistedSummaryText }],
        })
        .returning();

      await db
        .update(Conversation)
        .set({ summaryMessageID: summaryMsg.id })
        .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)));

      return summaryMsg;
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
    const result = await db
      .update(Conversation)
      .set({ deleted: true, deletedAt: new Date() })
      .where(and(eq(Conversation.id, conversationId), eq(Conversation.userID, userId)));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== CONTEXT METHOD =====

  async getContext(userId, conversationId, { compressed = false } = {}) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    let messages;
    if (compressed && conversation.summaryMessageID) {
      const summaryMsg = await db
        .select()
        .from(Message)
        .where(eq(Message.id, conversation.summaryMessageID))
        .limit(1);
      const summaryText = summaryMsg[0]?.content?.[0]?.text || "";
      const isValid = summaryMsg[0]?.content && summaryText.length >= 50;
      if (isValid) {
        messages = await db
          .select()
          .from(Message)
          .where(
            and(
              eq(Message.conversationID, conversationId),
              gte(Message.id, conversation.summaryMessageID)
            )
          )
          .orderBy(asc(Message.id));
      }
    }

    if (!messages) {
      messages = await db
        .select()
        .from(Message)
        .where(eq(Message.conversationID, conversationId))
        .orderBy(asc(Message.id));
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
    return msg;
  }

  async *summarize(userId, conversationId, { model, system, tools, thoughtBudget, userText } = {}) {
    if (!_invoke) return;

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

    const result = await _invoke({
      type: "chat-summary",
      model: model || check.model,
      stream: true,
      thoughtBudget: thoughtBudget ?? 0,
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
  }

  async getMessages(userId, conversationId) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return [];

    return db
      .select()
      .from(Message)
      .where(eq(Message.conversationID, conversationId))
      .orderBy(asc(Message.id));
  }

  async getMessage(userId, messageId) {
    const [msg] = await db.select().from(Message).where(eq(Message.id, messageId)).limit(1);
    if (!msg) return null;

    const conversation = await this.getConversation(userId, msg.conversationID);
    return conversation ? msg : null;
  }

  async updateMessage(userId, messageId, updates) {
    const existing = await this.getMessage(userId, messageId);
    if (!existing) return null;

    const result = await db
      .update(Message)
      .set(stripAutoFields(updates))
      .where(eq(Message.id, messageId))
      .returning();
    if (result.length === 0) return null;
    return this.getMessage(userId, messageId);
  }

  async deleteMessage(userId, messageId) {
    const existing = await this.getMessage(userId, messageId);
    if (!existing) return 0;

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
    const resourceData = {
      userID: userId || null,
      agentID: data.agentID || null,
      conversationID: data.conversationID || null,
      messageID: data.messageID || null,
      name: data.name,
      type: data.type,
      content: data.content,
      s3Uri: data.s3Uri || null,
      metadata: data.metadata || {},
    };
    const vectors = await this.#buildResourceVectors(userId, resourceData);

    return db.transaction(async (tx) => {
      const [resource] = await tx.insert(Resource).values(resourceData).returning();
      if (vectors.length) {
        await tx.insert(Vector).values(
          vectors.map((vector) => ({
            ...vector,
            resourceID: resource.id,
          }))
        );
      }
      return resource;
    });
  }

  async getResource(userId, resourceId) {
    const [resource] = await db
      .select()
      .from(Resource)
      .where(and(eq(Resource.id, resourceId), this.#resourceReadCondition(userId)))
      .limit(1);
    return resource || null;
  }

  async updateResource(userId, resourceId, updates) {
    const [existing] = await db
      .select()
      .from(Resource)
      .where(and(eq(Resource.id, resourceId), this.#resourceWriteCondition(userId)))
      .limit(1);
    if (!existing) return null;

    const resourceUpdates = stripAutoFields(updates);
    const shouldReindex = this.#shouldReindexResource(existing, resourceUpdates);
    const nextResource = { ...existing, ...resourceUpdates };
    const vectors = shouldReindex ? await this.#buildResourceVectors(userId, nextResource) : null;

    return db.transaction(async (tx) => {
      const [resource] = await tx
        .update(Resource)
        .set(resourceUpdates)
        .where(eq(Resource.id, resourceId))
        .returning();

      if (!resource) return null;

      if (shouldReindex) {
        await tx.delete(Vector).where(eq(Vector.resourceID, resourceId));
        if (vectors?.length) {
          await tx.insert(Vector).values(
            vectors.map((vector) => ({
              ...vector,
              resourceID: resourceId,
            }))
          );
        }
      }

      return resource;
    });
  }

  async getResourcesByAgent(userId, agentId) {
    return db
      .select()
      .from(Resource)
      .where(
        and(eq(Resource.agentID, agentId), or(eq(Resource.userID, userId), isNull(Resource.userID)))
      )
      .orderBy(asc(Resource.createdAt));
  }

  async getResourcesByConversation(userId, conversationId) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return [];

    return db
      .select()
      .from(Resource)
      .where(and(eq(Resource.conversationID, conversationId), this.#resourceReadCondition(userId)))
      .orderBy(asc(Resource.createdAt));
  }

  async deleteResource(userId, resourceId) {
    const [resource] = await db
      .select({ id: Resource.id })
      .from(Resource)
      .where(and(eq(Resource.id, resourceId), this.#resourceWriteCondition(userId)))
      .limit(1);
    if (!resource) return 0;

    await db.delete(Vector).where(eq(Vector.resourceID, resourceId));
    const result = await db.delete(Resource).where(eq(Resource.id, resourceId));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== VECTOR METHODS =====

  async addVectors(userId, conversationId, vectors) {
    const records = vectors.map((vector, index) => ({
      conversationID: vector.conversationID ?? conversationId ?? null,
      resourceID: vector.resourceID || null,
      toolID: vector.toolID || null,
      order: vector.order ?? index,
      content: vector.content,
      embedding:
        hasOwn(vector, "embedding") && vector.embedding !== null && vector.embedding !== undefined
          ? assertValidEmbedding(vector.embedding, {
              message: "Vector embeddings must contain 3072 numeric dimensions",
            })
          : null,
    }));
    return db.insert(Vector).values(records).returning();
  }

  async getVectorsByConversation(userId, conversationId) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return [];

    return db
      .select()
      .from(Vector)
      .where(eq(Vector.conversationID, conversationId))
      .orderBy(asc(Vector.order));
  }

  async getVectorsByResource(userId, resourceId) {
    const resource = await this.getResource(userId, resourceId);
    if (!resource) return [];

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

    if (!embedding) {
      return db
        .select()
        .from(Vector)
        .where(and(...conditions));
    }

    const queryEmbedding = assertValidEmbedding(embedding);
    const queryVector = sql`${sql.param(queryEmbedding, Vector.embedding)}::vector`;
    const distance = sql`${Vector.embedding} <=> ${queryVector}`;

    return db
      .select({
        id: Vector.id,
        conversationID: Vector.conversationID,
        resourceID: Vector.resourceID,
        toolID: Vector.toolID,
        order: Vector.order,
        content: Vector.content,
        embedding: Vector.embedding,
        createdAt: Vector.createdAt,
        updatedAt: Vector.updatedAt,
        similarity: sql`1 - (${distance})`.mapWith(Number).as("similarity"),
      })
      .from(Vector)
      .where(and(...conditions))
      .orderBy(distance)
      .limit(topN);
  }

  async deleteVectorsByResource(userId, resourceId) {
    const result = await db.delete(Vector).where(eq(Vector.resourceID, resourceId));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  async deleteVectorsByConversation(userId, conversationId) {
    const result = await db.delete(Vector).where(eq(Vector.conversationID, conversationId));
    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
  }

  // ===== SEARCH METHODS (for recall tool) =====

  async searchMessages(userId, { query, agentId, dateFrom, dateTo, limit = 20 }) {
    const messageText = sql`coalesce((
      SELECT string_agg(elem->>'text', ' ')
      FROM json_array_elements(${Message.content}) AS elem
      WHERE elem->>'text' IS NOT NULL
    ), '')`;
    const tsQuery = sql`plainto_tsquery('english', ${query})`;
    const rank = sql`ts_rank(to_tsvector('english', ${messageText}), ${tsQuery})`;
    const conditions = [
      eq(Conversation.userID, userId),
      eq(Conversation.deleted, false),
      sql`to_tsvector('english', ${messageText}) @@ ${tsQuery}`,
    ];
    if (agentId) conditions.push(eq(Conversation.agentID, agentId));
    if (dateFrom) conditions.push(gte(Message.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(Message.createdAt, new Date(dateTo)));

    const rows = await db
      .select({
        messageId: Message.id,
        conversationId: Conversation.id,
        agentId: Conversation.agentID,
        conversationTitle: Conversation.title,
        role: Message.role,
        content: Message.content,
        createdAt: Message.createdAt,
        rank: rank.mapWith(Number).as("rank"),
      })
      .from(Message)
      .innerJoin(Conversation, eq(Message.conversationID, Conversation.id))
      .where(and(...conditions))
      .orderBy(desc(rank), desc(Message.createdAt))
      .limit(limit);

    return rows.map((row) => {
      const texts = (row.content || []).filter((c) => c.text).map((c) => c.text);
      return { ...row, matchingText: texts.join("\n---\n"), content: undefined };
    });
  }

  async searchResourceVectors(userId, { embedding, topN = 10, dateFrom, dateTo }) {
    const conditions = [isNotNull(Vector.embedding), eq(Resource.userID, userId)];
    if (dateFrom) conditions.push(gte(Vector.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(Vector.createdAt, new Date(dateTo)));

    if (!embedding) return [];

    const queryEmbedding = assertValidEmbedding(embedding);
    const queryVector = sql`${sql.param(queryEmbedding, Vector.embedding)}::vector`;
    const distance = sql`${Vector.embedding} <=> ${queryVector}`;

    return db
      .select({
        id: Vector.id,
        resourceId: Resource.id,
        conversationId: Resource.conversationID,
        agentId: Resource.agentID,
        content: Vector.content,
        resourceName: Resource.name,
        resourceType: Resource.type,
        resourceCreatedAt: Resource.createdAt,
        createdAt: Vector.createdAt,
        metadata: Resource.metadata,
        similarity: sql`1 - (${distance})`.mapWith(Number).as("similarity"),
      })
      .from(Vector)
      .innerJoin(Resource, eq(Vector.resourceID, Resource.id))
      .where(and(...conditions))
      .orderBy(distance)
      .limit(topN);
  }

  async searchChunks(userId, { query, dateFrom, dateTo, limit = 20 }) {
    const tsQuery = sql`plainto_tsquery('english', ${query})`;
    const rank = sql`ts_rank(to_tsvector('english', coalesce(${Vector.content}, '')), ${tsQuery})`;

    const conditions = [
      sql`to_tsvector('english', coalesce(${Vector.content}, '')) @@ ${tsQuery}`,
      eq(Resource.userID, userId),
    ];
    if (dateFrom) conditions.push(gte(Vector.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(Vector.createdAt, new Date(dateTo)));

    return db
      .select({
        id: Vector.id,
        resourceId: Resource.id,
        conversationId: Resource.conversationID,
        agentId: Resource.agentID,
        content: Vector.content,
        resourceName: Resource.name,
        resourceType: Resource.type,
        resourceCreatedAt: Resource.createdAt,
        createdAt: Vector.createdAt,
        metadata: Resource.metadata,
        rank: rank.mapWith(Number).as("rank"),
      })
      .from(Vector)
      .innerJoin(Resource, eq(Vector.resourceID, Resource.id))
      .where(and(...conditions))
      .orderBy(desc(rank), desc(Vector.createdAt))
      .limit(limit);
  }
}

export const conversationService = new ConversationService();
