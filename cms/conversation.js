import { Op } from "sequelize";
import { Agent, Conversation, Message, Resource, Vector, Prompt, Tool, AgentTool, UserTool } from "database";

export class ConversationService {
  // ===== AGENT METHODS =====

  async createAgent(userId, data) {
    return Agent.create({
      userID: userId,
      name: data.name,
      description: data.description || null,
      promptID: data.promptID || null,
      modelParameters: data.modelParameters || null,
    });
  }

  async getAgent(userId, agentId) {
    const agent = await Agent.findOne({
      where: {
        id: agentId,
        [Op.or]: [{ userID: userId }, { userID: null }],
      },
      include: [
        { model: Prompt, attributes: ["id", "name", "content"] },
        { model: AgentTool, include: [{ model: Tool, attributes: ["name"] }] },
      ],
    });

    if (!agent) return null;

    const result = agent.toJSON();
    result.systemPrompt = result.Prompt?.content || null;
    result.tools = (result.AgentTools || []).map((at) => at.Tool?.name).filter(Boolean);
    return result;
  }

  async getAgents(userId) {
    const agents = await Agent.findAll({
      where: {
        [Op.or]: [{ userID: userId }, { userID: null }],
      },
      include: [
        { model: Prompt, attributes: ["id", "name", "content"] },
        { model: AgentTool, include: [{ model: Tool, attributes: ["name"] }] },
      ],
      order: [["createdAt", "DESC"]],
    });

    return agents.map((agent) => {
      const result = agent.toJSON();
      result.systemPrompt = result.Prompt?.content || null;
      result.tools = (result.AgentTools || []).map((at) => at.Tool?.name).filter(Boolean);
      return result;
    });
  }

  async updateAgent(userId, agentId, updates) {
    const { tools, ...agentFields } = updates;
    const [count] = await Agent.update(agentFields, { where: { id: agentId, userID: userId } });
    if (count === 0) return null;

    // Sync AgentTool junction table when tools array is provided
    if (Array.isArray(tools)) {
      await AgentTool.destroy({ where: { agentID: agentId } });
      const toolRecords = await Tool.findAll({ where: { name: tools } });
      const agentTools = toolRecords.map((t) => ({ agentID: agentId, toolID: t.id }));
      if (agentTools.length) await AgentTool.bulkCreate(agentTools);
    }

    return this.getAgent(userId, agentId);
  }

  async deleteAgent(userId, agentId) {
    const conversations = await Conversation.findAll({ where: { agentID: agentId, userID: userId } });
    for (const conversation of conversations) {
      await this.deleteConversation(userId, conversation.id);
    }
    return Agent.destroy({ where: { id: agentId, userID: userId } });
  }

  // ===== CONVERSATION METHODS =====

  async createConversation(userId, data) {
    return Conversation.create({
      userID: userId,
      agentID: data.agentID || null,
      title: data.title || "",
    });
  }

  async getConversation(userId, conversationId) {
    return Conversation.findOne({
      where: { id: conversationId, userID: userId, deleted: false },
    });
  }

  async getConversations(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    return Conversation.findAndCountAll({
      where: { userID: userId, deleted: false },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });
  }

  async updateConversation(userId, conversationId, updates) {
    const [count] = await Conversation.update(updates, {
      where: { id: conversationId, userID: userId, deleted: false },
    });
    if (count === 0) return null;
    return this.getConversation(userId, conversationId);
  }

  async deleteConversation(userId, conversationId) {
    // Soft delete
    const [count] = await Conversation.update(
      { deleted: true, deletedAt: new Date() },
      { where: { id: conversationId, userID: userId } }
    );
    return count;
  }

  // ===== CONTEXT METHOD =====

  async getContext(userId, conversationId) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    const messages = await Message.findAll({
      where: { conversationID: conversationId },
      order: [["createdAt", "ASC"]],
    });
    const messageIds = messages.map(m => m.id);
    const resources = await Resource.findAll({
      where: { messageID: { [Op.in]: messageIds } },
      order: [["createdAt", "ASC"]],
    });

    return { conversation, messages, resources };
  }

  // ===== COMPRESS METHOD =====

  async compressConversation(userId, conversationId, { summary, summaryMessageID }) {
    const conversation = await this.getConversation(userId, conversationId);
    if (!conversation) return null;

    await Conversation.update(
      { summaryMessageID },
      { where: { id: conversationId, userID: userId } }
    );

    return this.getConversation(userId, conversationId);
  }

  // ===== MESSAGE METHODS =====

  async addMessage(userId, conversationId, data) {
    return Message.create({
      conversationID: conversationId,
      parentID: data.parentID || null,
      role: data.role,
      content: data.content,
    });
  }

  async getMessages(userId, conversationId) {
    return Message.findAll({
      where: { conversationID: conversationId },
      order: [["createdAt", "ASC"]],
    });
  }

  async getMessage(userId, messageId) {
    return Message.findByPk(messageId);
  }

  async updateMessage(userId, messageId, updates) {
    const [count] = await Message.update(updates, { where: { id: messageId } });
    if (count === 0) return null;
    return this.getMessage(userId, messageId);
  }

  async deleteMessage(userId, messageId) {
    return Message.destroy({ where: { id: messageId } });
  }

  // ===== TOOL METHODS =====

  async createTool(data) {
    return Tool.create(data);
  }

  async getTool(toolId) {
    return Tool.findByPk(toolId);
  }

  async getTools(userId) {
    const builtinTools = await Tool.findAll({
      where: { type: "builtin" },
    });
    if (!userId) return builtinTools;

    const userTools = await Tool.findAll({
      include: [{ model: UserTool, where: { userID: userId }, required: true }],
    });
    return [...builtinTools, ...userTools];
  }

  async updateTool(toolId, updates) {
    const [count] = await Tool.update(updates, { where: { id: toolId } });
    if (count === 0) return null;
    return this.getTool(toolId);
  }

  async deleteTool(toolId) {
    await Vector.destroy({ where: { toolID: toolId } });
    await AgentTool.destroy({ where: { toolID: toolId } });
    await UserTool.destroy({ where: { toolID: toolId } });
    return Tool.destroy({ where: { id: toolId } });
  }

  // ===== PROMPT METHODS =====

  async createPrompt(data) {
    return Prompt.create(data);
  }

  async getPrompt(promptId) {
    return Prompt.findByPk(promptId);
  }

  async getPrompts(options = {}) {
    return Prompt.findAll({
      order: [["name", "ASC"], ["version", "DESC"]],
      ...options,
    });
  }

  async updatePrompt(promptId, updates) {
    const [count] = await Prompt.update(updates, { where: { id: promptId } });
    if (count === 0) return null;
    return this.getPrompt(promptId);
  }

  async deletePrompt(promptId) {
    return Prompt.destroy({ where: { id: promptId } });
  }

  // ===== RESOURCE METHODS =====

  async addResource(userId, data) {
    return Resource.create({
      agentID: data.agentID || null,
      messageID: data.messageID || null,
      name: data.name,
      type: data.type,
      content: data.content,
      s3Uri: data.s3Uri || null,
      metadata: data.metadata || {},
    });
  }

  async getResource(userId, resourceId) {
    return Resource.findByPk(resourceId);
  }

  async getResourcesByAgent(userId, agentId) {
    return Resource.findAll({
      where: { agentID: agentId },
      order: [["createdAt", "ASC"]],
    });
  }

  async deleteResource(userId, resourceId) {
    await Vector.destroy({ where: { resourceID: resourceId } });
    return Resource.destroy({ where: { id: resourceId } });
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
    return Vector.bulkCreate(records);
  }

  async getVectorsByConversation(userId, conversationId) {
    return Vector.findAll({
      where: { conversationID: conversationId },
      order: [["order", "ASC"]],
    });
  }

  async getVectorsByResource(userId, resourceId) {
    return Vector.findAll({
      where: { resourceID: resourceId },
      order: [["order", "ASC"]],
    });
  }

  async searchVectors({ toolID, conversationID, embedding, topN = 10 }) {
    const where = {};
    if (toolID) where.toolID = toolID;
    if (conversationID) where.conversationID = conversationID;

    const vectors = await Vector.findAll({
      where: { ...where, embedding: { [Op.ne]: null } },
    });

    if (!embedding || !vectors.length) return vectors;

    // Cosine similarity search
    const scored = vectors.map((v) => {
      const stored = v.embedding;
      let dotProduct = 0, normA = 0, normB = 0;
      for (let i = 0; i < embedding.length; i++) {
        dotProduct += embedding[i] * (stored[i] || 0);
        normA += embedding[i] * embedding[i];
        normB += (stored[i] || 0) * (stored[i] || 0);
      }
      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
      return { ...v.toJSON(), similarity };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topN);
  }

  async deleteVectorsByConversation(userId, conversationId) {
    return Vector.destroy({ where: { conversationID: conversationId } });
  }
}

export const conversationService = new ConversationService();
