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
    createConversation: (userId, data) => s.createConversation(userId, data),
    getConversations: (userId, options) => s.getConversations(userId, options),
    getConversation: (userId, conversationId) => s.getConversation(userId, conversationId),
    updateConversation: (userId, conversationId, updates) => s.updateConversation(userId, conversationId, updates),
    deleteConversation: (userId, conversationId) => s.deleteConversation(userId, conversationId),

    addMessage: (userId, conversationId, data) => s.addMessage(userId, conversationId, data),
    getMessages: (userId, conversationId) => s.getMessages(userId, conversationId),
    getMessage: (userId, messageId) => s.getMessage(userId, messageId),
    updateMessage: (userId, messageId, updates) => s.updateMessage(userId, messageId, updates),
    deleteMessage: (userId, messageId) => s.deleteMessage(userId, messageId),

    addResource: (userId, data) => s.addResource(userId, data),
    getResource: (userId, resourceId) => s.getResource(userId, resourceId),
    getResourcesByConversation: (userId, conversationId) => s.getResourcesByConversation(userId, conversationId),
    deleteResource: (userId, resourceId) => s.deleteResource(userId, resourceId),

    addVectors: (userId, conversationId, vectors) => s.addVectors(userId, conversationId, vectors),
    getVectorsByConversation: (userId, conversationId) => s.getVectorsByConversation(userId, conversationId),
  };
}

function buildHttpClient() {
  const s = new ConversationService(); // fallback for routes not yet exposed via HTTP
  return {
    createConversation: (userId, data) => httpRequest("POST", "/api/conversations", data, userId),
    getConversations: (userId, options = {}) => {
      const { limit = 20, offset = 0 } = options;
      return httpRequest("GET", `/api/conversations?limit=${limit}&offset=${offset}`, null, userId);
    },
    getConversation: (userId, conversationId) => httpRequest("GET", `/api/conversations/${conversationId}`, null, userId),
    updateConversation: (userId, conversationId, updates) => httpRequest("PUT", `/api/conversations/${conversationId}`, updates, userId),
    deleteConversation: (userId, conversationId) => httpRequest("DELETE", `/api/conversations/${conversationId}`, null, userId),

    addMessage: (userId, conversationId, data) => httpRequest("POST", `/api/conversations/${conversationId}/messages`, data, userId),
    getMessages: (userId, conversationId) => httpRequest("GET", `/api/conversations/${conversationId}/messages`, null, userId),
    getMessage: (userId, messageId) => s.getMessage(userId, messageId),
    updateMessage: (userId, messageId, updates) => httpRequest("PUT", `/api/messages/${messageId}`, updates, userId),
    deleteMessage: (userId, messageId) => httpRequest("DELETE", `/api/messages/${messageId}`, null, userId),

    addResource: (userId, data) => httpRequest("POST", "/api/resources", data, userId),
    getResource: (userId, resourceId) => httpRequest("GET", `/api/resources/${resourceId}`, null, userId),
    getResourcesByConversation: (userId, conversationId) => httpRequest("GET", `/api/conversations/${conversationId}/resources`, null, userId),
    deleteResource: (userId, resourceId) => httpRequest("DELETE", `/api/resources/${resourceId}`, null, userId),

    addVectors: (userId, conversationId, vectors) => httpRequest("POST", `/api/conversations/${conversationId}/vectors`, { vectors }, userId),
    getVectorsByConversation: (userId, conversationId) => httpRequest("GET", `/api/conversations/${conversationId}/vectors`, null, userId),
  };
}

export const cmsClient = CMS_URL ? buildHttpClient() : buildDirectClient();

// Named exports for convenience
export const {
  createConversation,
  getConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  addMessage,
  getMessages,
  getMessage,
  updateMessage,
  deleteMessage,
  addResource,
  getResource,
  getResourcesByConversation,
  deleteResource,
  addVectors,
  getVectorsByConversation,
} = cmsClient;
