import { Op } from "sequelize";
import {
  Agent, Conversation, Message, Resource, Vector,
} from "../database.js";
import { serviceError } from "./utils.js";

const { GATEWAY_URL = "http://localhost:3001" } = process.env;

function formatConversation(conv, messages = []) {
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

export async function deleteConversationCascade(conversationId) {
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

export async function createConversation(userId, data) {
  const { agentID, messages } = data;

  if (!agentID) throw serviceError(400, "agentID is required");
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw serviceError(400, "messages array is required");
  }

  const conversation = await Conversation.create({
    userId,
    agentId: agentID,
  });

  if (messages.length > 0) {
    await Message.bulkCreate(
      messages.map((m, i) => ({
        conversationId: conversation.id,
        serialNumber: i + 1,
        role: m.role,
        content: m.content,
      }))
    );
  }

  const storedMessages = await Message.findAll({
    where: { conversationId: conversation.id },
    order: [["serialNumber", "ASC"]],
  });

  return formatConversation(conversation, storedMessages);
}

export async function getConversations(userId) {
  const where = { userId };
  where[Op.or] = [{ deleted: false }, { deleted: null }];

  const conversations = await Conversation.findAll({
    where,
    order: [["createdAt", "DESC"]],
  });

  return conversations.map((c) => formatConversation(c));
}

export async function getConversation(userId, id) {
  const conversation = await Conversation.findOne({
    where: { id, userId },
  });
  if (!conversation) throw serviceError(404, "Conversation not found");

  const messages = await Message.findAll({
    where: { conversationId: conversation.id },
    order: [["serialNumber", "ASC"]],
  });

  return formatConversation(conversation, messages);
}

export async function chat(userId, id, data) {
  const conversation = await Conversation.findOne({
    where: { id, userId },
  });
  if (!conversation) throw serviceError(404, "Conversation not found");

  const { messages } = data;
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

  return formatConversation(conversation, updatedMessages);
}

export async function deleteConversation(userId, id) {
  const conversation = await Conversation.findOne({
    where: { id, userId },
  });
  if (!conversation) throw serviceError(404, "Conversation not found");

  await deleteConversationCascade(conversation.id);
  return { success: true };
}
