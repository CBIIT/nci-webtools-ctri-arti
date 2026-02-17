/**
 * CMS Client
 *
 * Provides a unified interface for conversation management that works in both:
 * - Monolith mode (direct function calls when CMS_URL is not set)
 * - Microservice mode (HTTP calls when CMS_URL is set)
 *
 * Uses a factory pattern — the mode is resolved once at module load time.
 */

import { ConversationService } from "../cms/conversation.js";

const CMS_URL = process.env.CMS_URL;

/**
 * Make an HTTP request to the CMS service
 */
async function httpRequest(method, path, body, userId) {
  const response = await fetch(`${CMS_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": String(userId),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    const err = new Error(error.error || "CMS request failed");
    err.status = response.status;
    throw err;
  }

  return response.json();
}

function buildDirectClient() {
  const s = new ConversationService();
  return {
    createAgent: (userId, data) => s.createAgent(userId, data),
    getAgents: (userId) => s.getAgents(userId),
    getAgent: (userId, agentId) => s.getAgent(userId, agentId),
    updateAgent: (userId, agentId, updates) => s.updateAgent(userId, agentId, updates),
    deleteAgent: (userId, agentId) => s.deleteAgent(userId, agentId),

    createThread: (userId, data) => s.createThread(userId, data),
    getThreads: (userId, options) => s.getThreads(userId, options),
    getThread: (userId, threadId) => s.getThread(userId, threadId),
    updateThread: (userId, threadId, updates) => s.updateThread(userId, threadId, updates),
    deleteThread: (userId, threadId) => s.deleteThread(userId, threadId),

    addMessage: (userId, threadId, data) => s.addMessage(userId, threadId, data),
    getMessages: (userId, threadId) => s.getMessages(userId, threadId),
    getMessage: (userId, messageId) => s.getMessage(userId, messageId),
    updateMessage: (userId, messageId, updates) => s.updateMessage(userId, messageId, updates),
    deleteMessage: (userId, messageId) => s.deleteMessage(userId, messageId),

    addResource: (userId, data) => s.addResource(userId, data),
    getResource: (userId, resourceId) => s.getResource(userId, resourceId),
    getResourcesByThread: (userId, threadId) => s.getResourcesByThread(userId, threadId),
    deleteResource: (userId, resourceId) => s.deleteResource(userId, resourceId),

    addVectors: (userId, threadId, vectors) => s.addVectors(userId, threadId, vectors),
    getVectorsByThread: (userId, threadId) => s.getVectorsByThread(userId, threadId),
    getVectorsByResource: (userId, resourceId) => s.getVectorsByResource(userId, resourceId),
    deleteVectorsByThread: (userId, threadId) => s.deleteVectorsByThread(userId, threadId),
  };
}

function buildHttpClient() {
  const s = new ConversationService(); // fallback for routes not yet exposed via HTTP
  return {
    createAgent: (userId, data) => httpRequest("POST", "/api/agents", data, userId),
    getAgents: (userId) => httpRequest("GET", "/api/agents", null, userId),
    getAgent: (userId, agentId) => httpRequest("GET", `/api/agents/${agentId}`, null, userId),
    updateAgent: (userId, agentId, updates) => httpRequest("PUT", `/api/agents/${agentId}`, updates, userId),
    deleteAgent: (userId, agentId) => httpRequest("DELETE", `/api/agents/${agentId}`, null, userId),

    createThread: (userId, data) => httpRequest("POST", "/api/threads", data, userId),
    getThreads: (userId, options = {}) => {
      const { limit = 20, offset = 0 } = options;
      return httpRequest("GET", `/api/threads?limit=${limit}&offset=${offset}`, null, userId);
    },
    getThread: (userId, threadId) => httpRequest("GET", `/api/threads/${threadId}`, null, userId),
    updateThread: (userId, threadId, updates) => httpRequest("PUT", `/api/threads/${threadId}`, updates, userId),
    deleteThread: (userId, threadId) => httpRequest("DELETE", `/api/threads/${threadId}`, null, userId),

    addMessage: (userId, threadId, data) => httpRequest("POST", `/api/threads/${threadId}/messages`, data, userId),
    getMessages: (userId, threadId) => httpRequest("GET", `/api/threads/${threadId}/messages`, null, userId),
    getMessage: (userId, messageId) => s.getMessage(userId, messageId),
    updateMessage: (userId, messageId, updates) => httpRequest("PUT", `/api/messages/${messageId}`, updates, userId),
    deleteMessage: (userId, messageId) => httpRequest("DELETE", `/api/messages/${messageId}`, null, userId),

    addResource: (userId, data) => httpRequest("POST", "/api/resources", data, userId),
    getResource: (userId, resourceId) => httpRequest("GET", `/api/resources/${resourceId}`, null, userId),
    getResourcesByThread: (userId, threadId) => httpRequest("GET", `/api/threads/${threadId}/resources`, null, userId),
    deleteResource: (userId, resourceId) => httpRequest("DELETE", `/api/resources/${resourceId}`, null, userId),

    addVectors: (userId, threadId, vectors) => httpRequest("POST", `/api/threads/${threadId}/vectors`, { vectors }, userId),
    getVectorsByThread: (userId, threadId) => httpRequest("GET", `/api/threads/${threadId}/vectors`, null, userId),
    getVectorsByResource: (userId, resourceId) => s.getVectorsByResource(userId, resourceId),
    deleteVectorsByThread: (userId, threadId) => s.deleteVectorsByThread(userId, threadId),
  };
}

export const cmsClient = CMS_URL ? buildHttpClient() : buildDirectClient();

// Named exports for backward compatibility
export const {
  createAgent,
  getAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  createThread,
  getThreads,
  getThread,
  updateThread,
  deleteThread,
  addMessage,
  getMessages,
  getMessage,
  updateMessage,
  deleteMessage,
  addResource,
  getResource,
  getResourcesByThread,
  deleteResource,
  addVectors,
  getVectorsByThread,
  getVectorsByResource,
  deleteVectorsByThread,
} = cmsClient;
