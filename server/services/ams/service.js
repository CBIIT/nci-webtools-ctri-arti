/**
 * Agent Management Service
 *
 * Core business logic for all AMS operations.
 * Used directly in monolith mode, or called by Express route handlers in microservice mode.
 */

import { Op, fn, col } from "sequelize";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import {
  Agent, Prompt, Model, Provider, AgentTool,
  Conversation, Message, Resource, Vector,
  Tool, KnowledgeBase, User, Role, UserAgent, UserTool, Usage,
} from "../database.js";
import logger from "../logger.js";

const { GATEWAY_URL = "http://localhost:3001", S3_BUCKET } = process.env;
const s3 = new S3Client();

function serviceError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  return err;
}

class AgentManagementService {
  // ===== Agent helpers =====

  #agentIncludes = [
    { model: Prompt, attributes: ["id", "name", "content"] },
    { model: Model, attributes: ["id", "name"] },
    { model: AgentTool, attributes: ["toolId"] },
  ];

  #formatAgent(agent) {
    const json = agent.toJSON();
    return {
      agentID: json.id,
      name: json.name,
      description: json.description,
      systemPrompt: json.Prompts?.[0]?.content || null,
      modelName: json.Model?.name || null,
      modelParameters: json.modelParameters,
      toolIDs: (json.AgentTools || []).map((at) => at.toolId),
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }

  async #findAgent(userId, agentId) {
    return Agent.findOne({
      where: {
        id: agentId,
        [Op.or]: [{ creatorId: userId }, { creatorId: null }],
      },
      include: this.#agentIncludes,
    });
  }

  // ===== Agent methods =====

  async createAgent(userId, data) {
    const { name, description, systemPrompt, modelID, modelParameters, toolIDs } = data;

    if (!name) throw serviceError(400, "name is required");
    if (!description) throw serviceError(400, "description is required");
    if (!systemPrompt) throw serviceError(400, "systemPrompt is required");
    if (!modelID) throw serviceError(400, "modelID is required");

    const agent = await Agent.create({
      creatorId: userId,
      name,
      description,
      modelId: modelID,
      modelParameters: modelParameters ?? null,
    });

    await Prompt.create({ agentId: agent.id, content: systemPrompt, name });

    if (toolIDs && toolIDs.length > 0) {
      await AgentTool.bulkCreate(toolIDs.map((toolId) => ({ agentId: agent.id, toolId })));
    }

    const result = await this.#findAgent(userId, agent.id);
    return this.#formatAgent(result);
  }

  async getAgents(userId) {
    const agents = await Agent.findAll({
      where: {
        [Op.or]: [{ creatorId: userId }, { creatorId: null }],
      },
      include: this.#agentIncludes,
      order: [["createdAt", "DESC"]],
    });
    return agents.map((a) => this.#formatAgent(a));
  }

  async getAgent(userId, agentId) {
    const agent = await this.#findAgent(userId, agentId);
    if (!agent) throw serviceError(404, "Agent not found");
    return this.#formatAgent(agent);
  }

  async updateAgent(userId, agentId, data) {
    const existing = await this.#findAgent(userId, agentId);
    if (!existing) throw serviceError(404, "Agent not found");
    if (existing.creatorId === null) {
      throw serviceError(403, "Cannot modify global agent");
    }

    const { name, description, systemPrompt, modelID, modelParameters, toolIDs } = data;

    if (systemPrompt !== undefined) {
      const existingPrompt = await Prompt.findOne({ where: { agentId } });
      if (existingPrompt) {
        await Prompt.update({ content: systemPrompt }, { where: { agentId } });
      } else {
        await Prompt.create({ agentId, content: systemPrompt, name: existing.name });
      }
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (modelID !== undefined) updates.modelId = modelID;
    if (modelParameters !== undefined) updates.modelParameters = modelParameters;
    if (Object.keys(updates).length > 0) {
      await Agent.update(updates, { where: { id: agentId, creatorId: userId } });
    }

    if (toolIDs !== undefined) {
      await AgentTool.destroy({ where: { agentId } });
      if (toolIDs.length > 0) {
        await AgentTool.bulkCreate(toolIDs.map((toolId) => ({ agentId, toolId })));
      }
    }

    const result = await this.#findAgent(userId, agentId);
    return this.#formatAgent(result);
  }

  async deleteAgent(userId, agentId) {
    const existing = await this.#findAgent(userId, agentId);
    if (!existing) throw serviceError(404, "Agent not found");
    if (existing.creatorId === null) {
      throw serviceError(403, "Cannot delete global agent");
    }

    await AgentTool.destroy({ where: { agentId } });

    const conversations = await Conversation.findAll({
      where: { agentId, userId },
      attributes: ["id"],
    });
    for (const conv of conversations) {
      await this.#deleteConversationCascade(conv.id);
    }

    await Agent.destroy({ where: { id: agentId, creatorId: userId } });
    return { success: true };
  }

  // ===== Model helpers =====

  #formatModel(m) {
    const json = m.toJSON();
    return {
      modelID: json.id,
      name: json.name,
      type: json.type,
      description: json.description,
      providerName: json.Provider?.name || null,
      internalName: json.internalName,
      defaultParameters: json.defaultParameters,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }

  // ===== Model methods =====

  async getModels(userId, query = {}) {
    const where = {};
    if (query.type) where.type = query.type;
    const models = await Model.findAll({
      where,
      include: [{ model: Provider, attributes: ["name"] }],
      order: [["id", "ASC"]],
    });
    return models.map((m) => this.#formatModel(m));
  }

  async getModel(userId, modelId) {
    const model = await Model.findByPk(modelId, {
      include: [{ model: Provider, attributes: ["name"] }],
    });
    if (!model) throw serviceError(404, "Model not found");
    return this.#formatModel(model);
  }

  // ===== Tool helpers =====

  #formatTool(t) {
    const json = t.toJSON();
    return {
      toolID: json.id,
      name: json.name,
      type: json.type,
      description: json.description,
      endpoint: json.endpoint,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }

  async #formatKnowledgebase(kb) {
    const json = kb.toJSON();

    let embeddingModelName = null;
    let rerankingModelName = null;
    if (json.embeddingModelId) {
      const m = await Model.findByPk(json.embeddingModelId, { attributes: ["name"] });
      embeddingModelName = m?.name || null;
    }
    if (json.rerankingModelId) {
      const m = await Model.findByPk(json.rerankingModelId, { attributes: ["name"] });
      rerankingModelName = m?.name || null;
    }

    const resources = await Resource.findAll({
      where: { knowledgeBaseId: json.id },
      order: [["createdAt", "ASC"]],
    });

    return {
      knowledgeBaseID: json.id,
      name: json.name,
      description: json.description || null,
      embeddingModelName,
      rerankingModelName,
      configuration: json.configuration || {},
      files: resources.map((r) => ({
        fileName: r.name,
        metadata: r.metadata,
      })),
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }

  // ===== Tool methods =====

  async getTools(userId) {
    const tools = await Tool.findAll({ order: [["id", "ASC"]] });
    return tools.map((t) => this.#formatTool(t));
  }

  // ===== Knowledgebase methods =====

  async createKnowledgebase(userId, data) {
    const { name, description, embeddingModelID, rerankingModelID, configuration, files } = data;

    if (!name) throw serviceError(400, "name is required");
    if (!description) throw serviceError(400, "description is required");
    if (!embeddingModelID) throw serviceError(400, "embeddingModelID is required");
    if (!rerankingModelID) throw serviceError(400, "rerankingModelID is required");
    if (!files || !Array.isArray(files) || files.length === 0) {
      throw serviceError(400, "files array is required");
    }

    const kb = await KnowledgeBase.create({
      name,
      description,
      embeddingModelId: embeddingModelID,
      rerankingModelId: rerankingModelID,
      configuration: configuration || {},
    });

    await Resource.bulkCreate(
      files.map((f) => ({
        knowledgeBaseId: kb.id,
        name: f.fileName,
        metadata: f.metadata || {},
      }))
    );

    return this.#formatKnowledgebase(kb);
  }

  async getKnowledgebases(userId) {
    const kbs = await KnowledgeBase.findAll({ order: [["id", "ASC"]] });
    return Promise.all(kbs.map((kb) => this.#formatKnowledgebase(kb)));
  }

  async getKnowledgebase(userId, id) {
    const kb = await KnowledgeBase.findByPk(id);
    if (!kb) throw serviceError(404, "Knowledgebase not found");
    return this.#formatKnowledgebase(kb);
  }

  async updateKnowledgebase(userId, id, data) {
    const kb = await KnowledgeBase.findByPk(id);
    if (!kb) throw serviceError(404, "Knowledgebase not found");

    const { name, description, embeddingModelID, rerankingModelID, configuration, files } = data;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (embeddingModelID !== undefined) updates.embeddingModelId = embeddingModelID;
    if (rerankingModelID !== undefined) updates.rerankingModelId = rerankingModelID;
    if (configuration !== undefined) {
      updates.configuration = { ...(kb.configuration || {}), ...configuration };
    }

    if (Object.keys(updates).length > 0) {
      await KnowledgeBase.update(updates, { where: { id } });
    }

    if (files && files.length > 0) {
      await Resource.bulkCreate(
        files.map((f) => ({
          knowledgeBaseId: parseInt(id),
          name: f.fileName,
          metadata: f.metadata || {},
        }))
      );
    }

    const updated = await KnowledgeBase.findByPk(id);
    return this.#formatKnowledgebase(updated);
  }

  async deleteKnowledgebase(userId, id) {
    const kb = await KnowledgeBase.findByPk(id);
    if (!kb) throw serviceError(404, "Knowledgebase not found");

    const resourceIds = (
      await Resource.findAll({ where: { knowledgeBaseId: id }, attributes: ["id"] })
    ).map((r) => r.id);
    if (resourceIds.length > 0) {
      await Vector.destroy({ where: { resourceId: resourceIds } });
    }
    await Resource.destroy({ where: { knowledgeBaseId: id } });
    await KnowledgeBase.destroy({ where: { id } });

    return { success: true };
  }

  async deleteKnowledgebaseFile(userId, id, files) {
    const kb = await KnowledgeBase.findByPk(id);
    if (!kb) throw serviceError(404, "Knowledgebase not found");

    if (!files || !Array.isArray(files) || files.length === 0) {
      throw serviceError(400, "files array is required");
    }

    for (const file of files) {
      const resource = await Resource.findOne({
        where: { knowledgeBaseId: id, name: file.fileName },
      });
      if (resource) {
        await Vector.destroy({ where: { resourceId: resource.id } });
        await Resource.destroy({ where: { id: resource.id } });
      }
    }

    return { success: true };
  }

  // ===== Conversation helpers =====

  #formatConversation(conv, messages = []) {
    const json = conv.toJSON ? conv.toJSON() : conv;
    return {
      conversationID: json.id,
      agentID: json.agentId,
      userID: json.userId,
      title: json.title ?? null,
      messages: messages.map((m) => {
        const mj = m.toJSON ? m.toJSON() : m;
        return {
          id: mj.id,
          role: mj.role,
          content: mj.content,
          serialNumber: mj.serialNumber,
          tokens: mj.tokens,
          createdAt: mj.createdAt,
        };
      }),
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
    };
  }

  async #deleteConversationCascade(conversationId) {
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
    await Conversation.destroy({ where: { id: conversationId } });
  }

  // ===== Conversation methods =====

  async createConversation(userId, data) {
    const { agentID, messages } = data;

    if (!agentID) throw serviceError(400, "agentID is required");
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw serviceError(400, "messages array is required");
    }

    const conversation = await Conversation.create({
      userId,
      agentId: agentID,
    });

    await Message.bulkCreate(
      messages.map((m, i) => ({
        conversationId: conversation.id,
        serialNumber: i + 1,
        role: m.role,
        content: m.content,
      }))
    );

    const storedMessages = await Message.findAll({
      where: { conversationId: conversation.id },
      order: [["serialNumber", "ASC"]],
    });

    return this.#formatConversation(conversation, storedMessages);
  }

  async getConversations(userId) {
    const where = { userId };
    where[Op.or] = [{ deleted: false }, { deleted: null }];

    const conversations = await Conversation.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });

    return conversations.map((c) => this.#formatConversation(c));
  }

  async getConversation(userId, id) {
    const conversation = await Conversation.findOne({
      where: { id, userId },
    });
    if (!conversation) throw serviceError(404, "Conversation not found");

    const messages = await Message.findAll({
      where: { conversationId: conversation.id },
      order: [["serialNumber", "ASC"]],
    });

    return this.#formatConversation(conversation, messages);
  }

  async chat(userId, id, data) {
    const conversation = await Conversation.findOne({
      where: { id, userId },
    });
    if (!conversation) throw serviceError(404, "Conversation not found");

    const { messages, stream = false } = data;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw serviceError(400, "messages array is required");
    }

    const agent = await Agent.findByPk(conversation.agentId);
    if (!agent) throw serviceError(404, "Agent not found");

    const lastMessage = await Message.findOne({
      where: { conversationId: conversation.id },
      order: [["serialNumber", "DESC"]],
      attributes: ["serialNumber"],
    });
    let nextSN = (lastMessage?.serialNumber || 0) + 1;

    for (const m of messages) {
      await Message.create({
        conversationId: conversation.id,
        serialNumber: nextSN++,
        role: m.role,
        content: m.content,
      });
    }

    const allMessages = await Message.findAll({
      where: { conversationId: conversation.id },
      order: [["serialNumber", "ASC"]],
    });

    const gatewayPayload = {
      action: "chat",
      user_id: parseInt(userId),
      agent_id: conversation.agentId,
      model_id: agent.modelId,
      messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
      stream,
    };

    const gatewayResponse = await fetch(`${GATEWAY_URL}/api/v1/modelInvoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gatewayPayload),
    });

    if (!gatewayResponse.ok) {
      const errorBody = await gatewayResponse.json().catch(() => ({}));
      throw serviceError(gatewayResponse.status, errorBody.error || "Gateway request failed");
    }

    if (stream) {
      let assistantContent = null;
      let usage = null;
      let buffer = "";
      const conversationId = conversation.id;
      const assistantSN = nextSN;
      const decoder = new TextDecoder();

      const { readable, writable } = new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(chunk);

          const text = decoder.decode(chunk, { stream: true });
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === "contentBlockDelta") {
                if (!assistantContent) assistantContent = [];
                const delta = event.contentBlockDelta?.delta;
                if (delta?.text) assistantContent.push(delta.text);
              }
              if (event.type === "metadata") {
                usage = event.metadata?.usage;
              }
            } catch {
              // Skip unparseable lines
            }
          }
        },
        async flush() {
          if (assistantContent) {
            await Message.create({
              conversationId,
              serialNumber: assistantSN,
              role: "assistant",
              content: [{ text: assistantContent.join("") }],
              tokens: usage ? (usage.outputTokens || 0) : null,
            });
          }
        },
      });

      gatewayResponse.body.pipeTo(writable).catch((err) => {
        logger.error("Stream pipe error:", err.message);
      });

      return { body: readable };
    } else {
      const result = await gatewayResponse.json();

      const assistantContent = result.output?.message?.content || null;
      if (assistantContent) {
        await Message.create({
          conversationId: conversation.id,
          serialNumber: nextSN,
          role: "assistant",
          content: assistantContent,
          tokens: result.usage?.outputTokens || null,
        });
      }

      const updatedMessages = await Message.findAll({
        where: { conversationId: conversation.id },
        order: [["serialNumber", "ASC"]],
      });

      return this.#formatConversation(conversation, updatedMessages);
    }
  }

  async deleteConversation(userId, id) {
    const conversation = await Conversation.findOne({
      where: { id, userId },
    });
    if (!conversation) throw serviceError(404, "Conversation not found");

    await this.#deleteConversationCascade(conversation.id);
    return { success: true };
  }

  // ===== User helpers =====

  #userIncludes = [{ model: Role, attributes: ["id", "name"] }];

  #formatUser(u) {
    const json = u.toJSON();
    return {
      userID: json.id,
      firstName: json.firstName,
      lastName: json.lastName,
      email: json.email,
      role: json.Role?.name || null,
      status: json.status,
      budget: json.budget,
    };
  }

  // ===== User methods =====

  async createUser(userId, data) {
    const { firstName, lastName, email, role, budget } = data;

    if (!firstName) throw serviceError(400, "firstName is required");
    if (!lastName) throw serviceError(400, "lastName is required");
    if (!email) throw serviceError(400, "email is required");
    if (!role) throw serviceError(400, "role is required");

    const roleRecord = await Role.findOne({ where: { name: role } });
    if (!roleRecord) throw serviceError(400, `Role "${role}" not found`);
    const roleId = roleRecord.id;

    const user = await User.create({
      firstName,
      lastName,
      email,
      roleId,
      budget: budget || null,
      remaining: budget || null,
      status: "active",
    });

    const result = await User.findByPk(user.id, { include: this.#userIncludes });
    return this.#formatUser(result);
  }

  async getUsers(userId, query = {}) {
    const where = {};
    if (query.status) where.status = query.status;

    const roleInclude = { model: Role, attributes: ["id", "name"] };
    if (query.role) roleInclude.where = { name: query.role };

    const users = await User.findAll({ where, include: [roleInclude], order: [["id", "ASC"]] });
    return users.map((u) => this.#formatUser(u));
  }

  async getUser(userId, id) {
    const user = await User.findByPk(id, { include: this.#userIncludes });
    if (!user) throw serviceError(404, "User not found");
    return this.#formatUser(user);
  }

  async updateUser(userId, id, data) {
    const user = await User.findByPk(id);
    if (!user) throw serviceError(404, "User not found");

    const { firstName, lastName, email, role, status, budget } = data;

    const updates = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (email !== undefined) updates.email = email;
    if (status !== undefined) updates.status = status;
    if (budget !== undefined) {
      updates.budget = budget;
      updates.remaining = budget;
    }

    if (role !== undefined) {
      const roleRecord = await Role.findOne({ where: { name: role } });
      if (!roleRecord) throw serviceError(400, `Role "${role}" not found`);
      updates.roleId = roleRecord.id;
    }

    await User.update(updates, { where: { id } });

    const result = await User.findByPk(id, { include: this.#userIncludes });
    return this.#formatUser(result);
  }

  async deleteUser(userId, id) {
    const user = await User.findByPk(id);
    if (!user) throw serviceError(404, "User not found");

    const conversations = await Conversation.findAll({
      where: { userId: id },
      attributes: ["id"],
    });
    for (const conv of conversations) {
      await this.#deleteConversationCascade(conv.id);
    }

    await UserAgent.destroy({ where: { userId: id } });
    await UserTool.destroy({ where: { userId: id } });
    await User.destroy({ where: { id } });

    return { success: true };
  }

  // ===== Usage methods =====

  async getUsages(userId, query = {}) {
    const pastDays = parseInt(query.pastDays) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - pastDays);
    startDate.setHours(0, 0, 0, 0);

    const where = { createdAt: { [Op.gte]: startDate } };
    if (query.userID) where.userId = query.userID;
    if (query.agentID) where.agentId = query.agentID;

    const include = [];
    if (query.role || query.status) {
      const userWhere = {};
      if (query.status) userWhere.status = query.status;

      const userInclude = { model: User, attributes: [], where: userWhere };
      if (query.role) {
        userInclude.include = [{ model: Role, attributes: [], where: { name: query.role } }];
      }
      include.push(userInclude);
    }

    return Usage.findAll({
      where,
      include,
      attributes: [
        [col("userId"), "userID"],
        [col("agentId"), "agentID"],
        [fn("SUM", col("cost")), "cost"],
      ],
      group: ["userId", "agentId"],
      raw: true,
    });
  }

  // ===== File methods =====

  async uploadFile(userId, file, filename) {
    if (!S3_BUCKET) throw serviceError(500, "S3_BUCKET not configured");
    if (!filename) throw serviceError(400, "filename is required");
    if (filename.includes("/") || filename.includes("..")) {
      throw serviceError(400, "Invalid filename");
    }
    if (!file) throw serviceError(400, "File content is required");

    const key = `user/${userId}/${filename}`;
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );
    } catch (err) {
      logger.error("S3 upload debug:", err.message, "cause:", err.cause?.message || err.cause);
      throw err;
    }

    return {
      filename,
      size: file.size,
      createdAt: new Date().toISOString(),
    };
  }

  async getFiles(userId) {
    if (!S3_BUCKET) throw serviceError(500, "S3_BUCKET not configured");

    const prefix = `user/${userId}/`;
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
      })
    );

    return (result.Contents || []).map((obj) => ({
      filename: obj.Key.replace(prefix, ""),
      size: obj.Size,
      createdAt: obj.LastModified,
    }));
  }

  async deleteFile(userId, filename) {
    if (!S3_BUCKET) throw serviceError(500, "S3_BUCKET not configured");
    if (!filename) throw serviceError(400, "filename is required");
    if (filename.includes("/") || filename.includes("..")) {
      throw serviceError(400, "Invalid filename");
    }

    const key = `user/${userId}/${filename}`;

    let head;
    try {
      head = await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch (err) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        throw serviceError(404, "File not found");
      }
      throw err;
    }

    await s3.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    );

    return { filename, size: head.ContentLength, createdAt: head.LastModified };
  }
}

export const agentManagementService = new AgentManagementService();
