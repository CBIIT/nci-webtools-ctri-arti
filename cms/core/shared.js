import { Agent, Resource } from "database";

import { eq, isNull, or } from "drizzle-orm";
import { createNotFoundError, createValidationError, hasOwn } from "shared/utils.js";

export function stripAutoFields(obj) {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = obj;
  return rest;
}

export function assertNoLegacyFields(input, legacyKeys, label = "Input") {
  const present = legacyKeys.filter((key) => hasOwn(input, key));
  if (!present.length) return;

  throw createValidationError(
    `${label} must use canonical field names, not legacy aliases: ${present.join(", ")}`
  );
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
