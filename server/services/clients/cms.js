/**
 * CMS Client
 *
 * Provides a unified interface for conversation management that works in both:
 * - Monolith mode (direct function calls when CMS_URL is not set)
 * - Microservice mode (HTTP calls when CMS_URL is set)
 *
 * Uses a factory pattern — the mode is resolved once at module load time.
 */

import { ConversationService } from "cms/conversation.js";

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

    createConversation: (userId, data) => s.createConversation(userId, data),
    getConversations: (userId, options) => s.getConversations(userId, options),
    getConversation: (userId, conversationId) => s.getConversation(userId, conversationId),
    updateConversation: (userId, conversationId, updates) => s.updateConversation(userId, conversationId, updates),
    deleteConversation: (userId, conversationId) => s.deleteConversation(userId, conversationId),

    getContext: (userId, conversationId) => s.getContext(userId, conversationId),
    compressConversation: (userId, conversationId, data) => s.compressConversation(userId, conversationId, data),

    addMessage: (userId, conversationId, data) => s.addMessage(userId, conversationId, data),
    getMessages: (userId, conversationId) => s.getMessages(userId, conversationId),
    getMessage: (userId, messageId) => s.getMessage(userId, messageId),
    updateMessage: (userId, messageId, updates) => s.updateMessage(userId, messageId, updates),
    deleteMessage: (userId, messageId) => s.deleteMessage(userId, messageId),

    createTool: (data) => s.createTool(data),
    getTool: (toolId) => s.getTool(toolId),
    getTools: (userId) => s.getTools(userId),
    updateTool: (toolId, updates) => s.updateTool(toolId, updates),
    deleteTool: (toolId) => s.deleteTool(toolId),

    createPrompt: (data) => s.createPrompt(data),
    getPrompt: (promptId) => s.getPrompt(promptId),
    getPrompts: (options) => s.getPrompts(options),
    updatePrompt: (promptId, updates) => s.updatePrompt(promptId, updates),
    deletePrompt: (promptId) => s.deletePrompt(promptId),

    addResource: (userId, data) => s.addResource(userId, data),
    getResource: (userId, resourceId) => s.getResource(userId, resourceId),
    getResourcesByAgent: (userId, agentId) => s.getResourcesByAgent(userId, agentId),
    deleteResource: (userId, resourceId) => s.deleteResource(userId, resourceId),

    addVectors: (userId, conversationId, vectors) => s.addVectors(userId, conversationId, vectors),
    getVectorsByConversation: (userId, conversationId) => s.getVectorsByConversation(userId, conversationId),
    getVectorsByResource: (userId, resourceId) => s.getVectorsByResource(userId, resourceId),
    searchVectors: (params) => s.searchVectors(params),
    deleteVectorsByConversation: (userId, conversationId) => s.deleteVectorsByConversation(userId, conversationId),
  };
}

function buildHttpClient() {
  const s = new ConversationService(); // fallback for routes not yet exposed via HTTP
  return {
    createAgent: (userId, data) => httpRequest("POST", "/api/v1/agents", data, userId),
    getAgents: (userId) => httpRequest("GET", "/api/v1/agents", null, userId),
    getAgent: (userId, agentId) => httpRequest("GET", `/api/v1/agents/${agentId}`, null, userId),
    updateAgent: (userId, agentId, updates) => httpRequest("PUT", `/api/v1/agents/${agentId}`, updates, userId),
    deleteAgent: (userId, agentId) => httpRequest("DELETE", `/api/v1/agents/${agentId}`, null, userId),

    createConversation: (userId, data) => httpRequest("POST", "/api/v1/conversations", data, userId),
    getConversations: (userId, options = {}) => {
      const { limit = 20, offset = 0 } = options;
      return httpRequest("GET", `/api/v1/conversations?limit=${limit}&offset=${offset}`, null, userId);
    },
    getConversation: (userId, conversationId) => httpRequest("GET", `/api/v1/conversations/${conversationId}`, null, userId),
    updateConversation: (userId, conversationId, updates) => httpRequest("PUT", `/api/v1/conversations/${conversationId}`, updates, userId),
    deleteConversation: (userId, conversationId) => httpRequest("DELETE", `/api/v1/conversations/${conversationId}`, null, userId),

    getContext: (userId, conversationId) => httpRequest("GET", `/api/v1/conversations/${conversationId}/context`, null, userId),
    compressConversation: (userId, conversationId, data) => httpRequest("POST", `/api/v1/conversations/${conversationId}/compress`, data, userId),

    addMessage: (userId, conversationId, data) => httpRequest("POST", `/api/v1/conversations/${conversationId}/messages`, data, userId),
    getMessages: (userId, conversationId) => httpRequest("GET", `/api/v1/conversations/${conversationId}/messages`, null, userId),
    getMessage: (userId, messageId) => s.getMessage(userId, messageId),
    updateMessage: (userId, messageId, updates) => httpRequest("PUT", `/api/v1/messages/${messageId}`, updates, userId),
    deleteMessage: (userId, messageId) => httpRequest("DELETE", `/api/v1/messages/${messageId}`, null, userId),

    createTool: (data) => httpRequest("POST", "/api/v1/tools", data, null),
    getTool: (toolId) => httpRequest("GET", `/api/v1/tools/${toolId}`, null, null),
    getTools: (userId) => httpRequest("GET", "/api/v1/tools", null, userId),
    updateTool: (toolId, updates) => httpRequest("PUT", `/api/v1/tools/${toolId}`, updates, null),
    deleteTool: (toolId) => httpRequest("DELETE", `/api/v1/tools/${toolId}`, null, null),

    createPrompt: (data) => httpRequest("POST", "/api/v1/prompts", data, null),
    getPrompt: (promptId) => httpRequest("GET", `/api/v1/prompts/${promptId}`, null, null),
    getPrompts: () => httpRequest("GET", "/api/v1/prompts", null, null),
    updatePrompt: (promptId, updates) => httpRequest("PUT", `/api/v1/prompts/${promptId}`, updates, null),
    deletePrompt: (promptId) => httpRequest("DELETE", `/api/v1/prompts/${promptId}`, null, null),

    addResource: (userId, data) => httpRequest("POST", "/api/v1/resources", data, userId),
    getResource: (userId, resourceId) => httpRequest("GET", `/api/v1/resources/${resourceId}`, null, userId),
    getResourcesByAgent: (userId, agentId) => httpRequest("GET", `/api/v1/agents/${agentId}/resources`, null, userId),
    deleteResource: (userId, resourceId) => httpRequest("DELETE", `/api/v1/resources/${resourceId}`, null, userId),

    addVectors: (userId, conversationId, vectors) => httpRequest("POST", "/api/v1/vectors", { conversationID: conversationId, vectors }, userId),
    getVectorsByConversation: (userId, conversationId) => httpRequest("GET", `/api/v1/conversations/${conversationId}/vectors`, null, userId),
    getVectorsByResource: (userId, resourceId) => s.getVectorsByResource(userId, resourceId),
    searchVectors: (params) => httpRequest("GET", `/api/v1/vectors/search?${new URLSearchParams(params)}`, null, null),
    deleteVectorsByConversation: (userId, conversationId) => s.deleteVectorsByConversation(userId, conversationId),
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
  createConversation,
  getConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  getContext,
  compressConversation,
  addMessage,
  getMessages,
  getMessage,
  updateMessage,
  deleteMessage,
  createTool,
  getTool,
  getTools,
  updateTool,
  deleteTool,
  createPrompt,
  getPrompt,
  getPrompts,
  updatePrompt,
  deletePrompt,
  addResource,
  getResource,
  getResourcesByAgent,
  deleteResource,
  addVectors,
  getVectorsByConversation,
  getVectorsByResource,
  searchVectors,
  deleteVectorsByConversation,
} = cmsClient;
