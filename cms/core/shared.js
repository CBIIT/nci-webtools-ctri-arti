import { Agent, Resource } from "database";

import { eq, isNull, or } from "drizzle-orm";

export function stripAutoFields(obj) {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = obj;
  return rest;
}

export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function createNotFoundError(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

export function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function getMutationCount(result) {
  return result.rowCount ?? result.affectedRows ?? result.changes ?? 0;
}

export function validateConversationMessage(role, content) {
  if (!Array.isArray(content)) {
    throw createValidationError("Message content must be an array");
  }

  let hasToolUse = false;
  let hasToolResult = false;
  for (const block of content) {
    if (block?.toolUse) hasToolUse = true;
    if (block?.toolResult) hasToolResult = true;
  }

  if (hasToolUse && hasToolResult) {
    throw createValidationError("A single message cannot contain both tool uses and tool results");
  }
  if (role === "user" && hasToolUse) {
    throw createValidationError("User messages cannot contain tool uses");
  }
  if (role === "assistant" && hasToolResult) {
    throw createValidationError("Assistant messages cannot contain tool results");
  }
}

export function resourceReadCondition(userId) {
  return userId === null || userId === undefined
    ? isNull(Resource.userID)
    : or(eq(Resource.userID, userId), isNull(Resource.userID));
}

export function agentReadCondition(userId) {
  return userId === null || userId === undefined
    ? isNull(Agent.userID)
    : or(eq(Agent.userID, userId), isNull(Agent.userID));
}

export function resourceWriteCondition(userId) {
  return eq(Resource.userID, userId);
}

export async function requireConversation(service, userId, conversationId) {
  const conversation = await service.getConversation(userId, conversationId);
  if (!conversation) {
    throw createNotFoundError(`Conversation not found: ${conversationId}`);
  }
  return conversation;
}

export async function requireMessage(service, userId, messageId) {
  const message = await service.getMessage(userId, messageId);
  if (!message) {
    throw createNotFoundError(`Message not found: ${messageId}`);
  }
  return message;
}
