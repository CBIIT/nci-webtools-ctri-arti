import { Thread, Message, Resource, Vector } from "../database.js";

export class ConversationService {
  // ===== THREAD METHODS =====

  async createThread(userId, data) {
    return Thread.create({
      userId,
      agentId: data.agentId || null,
      name: data.name || "",
    });
  }

  async getThread(userId, threadId) {
    return Thread.findOne({ where: { id: threadId, userId } });
  }

  async getThreads(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    return Thread.findAndCountAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });
  }

  async updateThread(userId, threadId, updates) {
    const [count] = await Thread.update(updates, { where: { id: threadId, userId } });
    if (count === 0) return null;
    return this.getThread(userId, threadId);
  }

  async deleteThread(userId, threadId) {
    await Message.destroy({ where: { threadId, userId } });
    await Resource.destroy({ where: { threadId, userId } });
    await Vector.destroy({ where: { threadId, userId } });
    return Thread.destroy({ where: { id: threadId, userId } });
  }

  // ===== MESSAGE METHODS =====

  async addMessage(userId, threadId, data) {
    return Message.create({
      userId,
      threadId,
      agentId: data.agentId || null,
      role: data.role,
      content: data.content,
    });
  }

  async getMessages(userId, threadId) {
    return Message.findAll({
      where: { threadId, userId },
      order: [["createdAt", "ASC"]],
    });
  }

  async getMessage(userId, messageId) {
    return Message.findOne({ where: { id: messageId, userId } });
  }

  async updateMessage(userId, messageId, updates) {
    const [count] = await Message.update(updates, { where: { id: messageId, userId } });
    if (count === 0) return null;
    return this.getMessage(userId, messageId);
  }

  async deleteMessage(userId, messageId) {
    return Message.destroy({ where: { id: messageId, userId } });
  }

  // ===== RESOURCE METHODS =====

  async addResource(userId, data) {
    return Resource.create({
      userId,
      agentId: data.agentId || null,
      threadId: data.threadId || null,
      messageId: data.messageId || null,
      name: data.name,
      type: data.type,
      content: data.content,
      s3Uri: data.s3Uri || null,
      metadata: data.metadata || {},
    });
  }

  async getResource(userId, resourceId) {
    return Resource.findOne({ where: { id: resourceId, userId } });
  }

  async getResourcesByThread(userId, threadId) {
    return Resource.findAll({
      where: { threadId, userId },
      order: [["createdAt", "ASC"]],
    });
  }

  async deleteResource(userId, resourceId) {
    await Vector.destroy({ where: { resourceId, userId } });
    return Resource.destroy({ where: { id: resourceId, userId } });
  }

  // ===== VECTOR METHODS =====

  async addVectors(userId, threadId, vectors) {
    const records = vectors.map((vector, index) => ({
      userId,
      threadId,
      resourceId: vector.resourceId || null,
      order: vector.order ?? index,
      text: vector.text,
      embedding: vector.embedding || null,
    }));
    return Vector.bulkCreate(records);
  }

  async getVectorsByThread(userId, threadId) {
    return Vector.findAll({
      where: { threadId, userId },
      order: [["order", "ASC"]],
    });
  }

  async getVectorsByResource(userId, resourceId) {
    return Vector.findAll({
      where: { resourceId, userId },
      order: [["order", "ASC"]],
    });
  }

  async deleteVectorsByThread(userId, threadId) {
    return Vector.destroy({ where: { threadId, userId } });
  }
}

export const conversationService = new ConversationService();
