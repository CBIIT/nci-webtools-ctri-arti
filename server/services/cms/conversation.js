import { Conversation, Message, Resource, Vector } from "../database.js";

export class ConversationService {
  // ===== CONVERSATION METHODS =====

  async createConversation(userId, data) {
    return Conversation.create({
      userId,
      agentId: data.agentId || null,
      title: data.title || "",
    });
  }

  async getConversation(userId, conversationId) {
    return Conversation.findOne({ where: { id: conversationId, userId } });
  }

  async getConversations(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    return Conversation.findAndCountAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });
  }

  async updateConversation(userId, conversationId, updates) {
    const [count] = await Conversation.update(updates, { where: { id: conversationId, userId } });
    if (count === 0) return null;
    return this.getConversation(userId, conversationId);
  }

  async deleteConversation(userId, conversationId) {
    const messageIds = (
      await Message.findAll({ where: { conversationId }, attributes: ["id"] })
    ).map((m) => m.id);
    if (messageIds.length > 0) {
      const resourceIds = (
        await Resource.findAll({ where: { messageId: messageIds }, attributes: ["id"] })
      ).map((r) => r.id);
      if (resourceIds.length > 0) {
        await Vector.destroy({ where: { resourceId: resourceIds } });
      }
      await Resource.destroy({ where: { messageId: messageIds } });
    }
    await Message.destroy({ where: { conversationId } });
    return Conversation.destroy({ where: { id: conversationId, userId } });
  }

  // ===== MESSAGE METHODS =====

  async addMessage(userId, conversationId, data) {
    return Message.create({
      conversationId,
      role: data.role,
      content: data.content,
    });
  }

  async getMessages(userId, conversationId) {
    return Message.findAll({
      where: { conversationId },
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

  // ===== RESOURCE METHODS =====

  async addResource(userId, data) {
    return Resource.create({
      messageId: data.messageId || null,
      name: data.name,
      s3Url: data.s3Url || null,
      metadata: data.metadata || {},
    });
  }

  async getResource(userId, resourceId) {
    return Resource.findByPk(resourceId);
  }

  async getResourcesByConversation(userId, conversationId) {
    const messageIds = (
      await Message.findAll({ where: { conversationId }, attributes: ["id"] })
    ).map((m) => m.id);
    if (messageIds.length === 0) return [];
    return Resource.findAll({
      where: { messageId: messageIds },
      order: [["createdAt", "ASC"]],
    });
  }

  async deleteResource(userId, resourceId) {
    await Vector.destroy({ where: { resourceId } });
    return Resource.destroy({ where: { id: resourceId } });
  }

  // ===== VECTOR METHODS =====

  async addVectors(userId, conversationId, vectors) {
    const records = vectors.map((vector, index) => ({
      resourceId: vector.resourceId || null,
      order: vector.order ?? index,
      embedding: vector.embedding || null,
    }));
    return Vector.bulkCreate(records);
  }

  async getVectorsByConversation(userId, conversationId) {
    const messageIds = (
      await Message.findAll({ where: { conversationId }, attributes: ["id"] })
    ).map((m) => m.id);
    if (messageIds.length === 0) return [];
    const resourceIds = (
      await Resource.findAll({ where: { messageId: messageIds }, attributes: ["id"] })
    ).map((r) => r.id);
    if (resourceIds.length === 0) return [];
    return Vector.findAll({
      where: { resourceId: resourceIds },
      order: [["order", "ASC"]],
    });
  }
}

export const conversationService = new ConversationService();
