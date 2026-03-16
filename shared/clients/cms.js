/**
 * CMS Client
 *
 * Provides a unified interface for conversation management that works in both:
 * - Monolith mode (direct function calls when CMS_URL is not set)
 * - Microservice mode (HTTP calls when CMS_URL is set)
 *
 * Uses a factory pattern — the mode is resolved once at module load time.
 */

import { parseNdjsonStream } from "./ndjson.js";

const CMS_URL = process.env.CMS_URL;
let directClientPromise;

function createHeaders(userId) {
  return {
    "Content-Type": "application/json",
    "X-User-Id": String(userId),
  };
}

function normalizeConversationPage(result, { limit = 20, offset = 0 } = {}) {
  if (result?.data !== undefined) return result;

  return {
    data: result?.rows || [],
    meta: {
      total: result?.count || 0,
      limit,
      offset,
    },
  };
}

async function getDirectClient() {
  if (!directClientPromise) {
    directClientPromise = (async () => {
      const [{ ConversationService }, { invoke }] = await Promise.all([
        import("cms/conversation.js"),
        import("./gateway.js"),
      ]);

      ConversationService.setInvoker(invoke);
      const service = new ConversationService();

      return {
        createAgent: (userId, data) => service.createAgent(userId, data),
        getAgents: (userId) => service.getAgents(userId),
        getAgent: (userId, agentId) => service.getAgent(userId, agentId),
        updateAgent: (userId, agentId, updates) => service.updateAgent(userId, agentId, updates),
        deleteAgent: (userId, agentId) => service.deleteAgent(userId, agentId),

        createConversation: (userId, data) => service.createConversation(userId, data),
        getConversations: async (userId, options = {}) => {
          const { limit = 20, offset = 0 } = options;
          const result = await service.getConversations(userId, { limit, offset });
          return normalizeConversationPage(result, { limit, offset });
        },
        getConversation: (userId, conversationId) =>
          service.getConversation(userId, conversationId),
        updateConversation: (userId, conversationId, updates) =>
          service.updateConversation(userId, conversationId, updates),
        deleteConversation: (userId, conversationId) =>
          service.deleteConversation(userId, conversationId),

        getContext: (userId, conversationId, options) =>
          service.getContext(userId, conversationId, options),
        summarize: (userId, cid, params) => service.summarize(userId, cid, params),

        addMessage: (userId, conversationId, data) =>
          service.addMessage(userId, conversationId, data),
        getMessages: (userId, conversationId) => service.getMessages(userId, conversationId),
        getMessage: (userId, messageId) => service.getMessage(userId, messageId),
        updateMessage: (userId, messageId, updates) =>
          service.updateMessage(userId, messageId, updates),
        deleteMessage: (userId, messageId) => service.deleteMessage(userId, messageId),

        createTool: (data) => service.createTool(data),
        getTool: (toolId) => service.getTool(toolId),
        getTools: (userId) => service.getTools(userId),
        updateTool: (toolId, updates) => service.updateTool(toolId, updates),
        deleteTool: (toolId) => service.deleteTool(toolId),

        createPrompt: (data) => service.createPrompt(data),
        getPrompt: (promptId) => service.getPrompt(promptId),
        getPrompts: (options) => service.getPrompts(options),
        updatePrompt: (promptId, updates) => service.updatePrompt(promptId, updates),
        deletePrompt: (promptId) => service.deletePrompt(promptId),

        addResource: (userId, data) => service.addResource(userId, data),
        getResource: (userId, resourceId) => service.getResource(userId, resourceId),
        updateResource: (userId, resourceId, updates) =>
          service.updateResource(userId, resourceId, updates),
        getResourcesByAgent: (userId, agentId) => service.getResourcesByAgent(userId, agentId),
        getResourcesByConversation: (userId, conversationId) =>
          service.getResourcesByConversation(userId, conversationId),
        deleteResource: (userId, resourceId) => service.deleteResource(userId, resourceId),

        addVectors: (userId, conversationId, vectors) =>
          service.addVectors(userId, conversationId, vectors),
        getVectorsByConversation: (userId, conversationId) =>
          service.getVectorsByConversation(userId, conversationId),
        getVectorsByResource: (userId, resourceId) =>
          service.getVectorsByResource(userId, resourceId),
        searchVectors: (params) => service.searchVectors(params),
        deleteVectorsByResource: (userId, resourceId) =>
          service.deleteVectorsByResource(userId, resourceId),
        deleteVectorsByConversation: (userId, conversationId) =>
          service.deleteVectorsByConversation(userId, conversationId),

        searchMessages: (userId, params) => service.searchMessages(userId, params),
        searchResourceVectors: (userId, params) => service.searchResourceVectors(userId, params),
        searchChunks: (userId, params) => service.searchChunks(userId, params),
      };
    })();
  }

  return directClientPromise;
}

/**
 * Make an HTTP request to the CMS service
 */
async function httpRequest(method, path, body, userId) {
  const response = await fetch(`${CMS_URL}${path}`, {
    method,
    headers: createHeaders(userId),
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

/**
 * Make a streaming NDJSON request — returns an async generator of parsed events.
 */
async function* streamRequest(method, path, body, userId) {
  const response = await fetch(`${CMS_URL}${path}`, {
    method,
    headers: createHeaders(userId),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || "CMS stream request failed");
  }

  for await (const event of parseNdjsonStream(response.body)) {
    if (event.error) throw new Error(event.error);
    yield event;
  }
}

const directClient = {
  createAgent: async (userId, data) => (await getDirectClient()).createAgent(userId, data),
  getAgents: async (userId) => (await getDirectClient()).getAgents(userId),
  getAgent: async (userId, agentId) => (await getDirectClient()).getAgent(userId, agentId),
  updateAgent: async (userId, agentId, updates) =>
    (await getDirectClient()).updateAgent(userId, agentId, updates),
  deleteAgent: async (userId, agentId) => (await getDirectClient()).deleteAgent(userId, agentId),

  createConversation: async (userId, data) =>
    (await getDirectClient()).createConversation(userId, data),
  getConversations: async (userId, options) =>
    (await getDirectClient()).getConversations(userId, options),
  getConversation: async (userId, conversationId) =>
    (await getDirectClient()).getConversation(userId, conversationId),
  updateConversation: async (userId, conversationId, updates) =>
    (await getDirectClient()).updateConversation(userId, conversationId, updates),
  deleteConversation: async (userId, conversationId) =>
    (await getDirectClient()).deleteConversation(userId, conversationId),

  getContext: async (userId, conversationId, options) =>
    (await getDirectClient()).getContext(userId, conversationId, options),
  summarize: async function* (userId, cid, params) {
    yield* (await getDirectClient()).summarize(userId, cid, params);
  },

  addMessage: async (userId, conversationId, data) =>
    (await getDirectClient()).addMessage(userId, conversationId, data),
  getMessages: async (userId, conversationId) =>
    (await getDirectClient()).getMessages(userId, conversationId),
  getMessage: async (userId, messageId) => (await getDirectClient()).getMessage(userId, messageId),
  updateMessage: async (userId, messageId, updates) =>
    (await getDirectClient()).updateMessage(userId, messageId, updates),
  deleteMessage: async (userId, messageId) =>
    (await getDirectClient()).deleteMessage(userId, messageId),

  createTool: async (data) => (await getDirectClient()).createTool(data),
  getTool: async (toolId) => (await getDirectClient()).getTool(toolId),
  getTools: async (userId) => (await getDirectClient()).getTools(userId),
  updateTool: async (toolId, updates) => (await getDirectClient()).updateTool(toolId, updates),
  deleteTool: async (toolId) => (await getDirectClient()).deleteTool(toolId),

  createPrompt: async (data) => (await getDirectClient()).createPrompt(data),
  getPrompt: async (promptId) => (await getDirectClient()).getPrompt(promptId),
  getPrompts: async (options) => (await getDirectClient()).getPrompts(options),
  updatePrompt: async (promptId, updates) =>
    (await getDirectClient()).updatePrompt(promptId, updates),
  deletePrompt: async (promptId) => (await getDirectClient()).deletePrompt(promptId),

  addResource: async (userId, data) => (await getDirectClient()).addResource(userId, data),
  getResource: async (userId, resourceId) =>
    (await getDirectClient()).getResource(userId, resourceId),
  updateResource: async (userId, resourceId, updates) =>
    (await getDirectClient()).updateResource(userId, resourceId, updates),
  getResourcesByAgent: async (userId, agentId) =>
    (await getDirectClient()).getResourcesByAgent(userId, agentId),
  getResourcesByConversation: async (userId, conversationId) =>
    (await getDirectClient()).getResourcesByConversation(userId, conversationId),
  deleteResource: async (userId, resourceId) =>
    (await getDirectClient()).deleteResource(userId, resourceId),

  addVectors: async (userId, conversationId, vectors) =>
    (await getDirectClient()).addVectors(userId, conversationId, vectors),
  getVectorsByConversation: async (userId, conversationId) =>
    (await getDirectClient()).getVectorsByConversation(userId, conversationId),
  getVectorsByResource: async (userId, resourceId) =>
    (await getDirectClient()).getVectorsByResource(userId, resourceId),
  searchVectors: async (params) => (await getDirectClient()).searchVectors(params),
  deleteVectorsByResource: async (userId, resourceId) =>
    (await getDirectClient()).deleteVectorsByResource(userId, resourceId),
  deleteVectorsByConversation: async (userId, conversationId) =>
    (await getDirectClient()).deleteVectorsByConversation(userId, conversationId),

  searchMessages: async (userId, params) =>
    (await getDirectClient()).searchMessages(userId, params),
  searchResourceVectors: async (userId, params) =>
    (await getDirectClient()).searchResourceVectors(userId, params),
  searchChunks: async (userId, params) => (await getDirectClient()).searchChunks(userId, params),
};

function buildHttpClient() {
  return {
    createAgent: (userId, data) => httpRequest("POST", "/api/v1/agents", data, userId),
    getAgents: (userId) => httpRequest("GET", "/api/v1/agents", null, userId),
    getAgent: (userId, agentId) => httpRequest("GET", `/api/v1/agents/${agentId}`, null, userId),
    updateAgent: (userId, agentId, updates) =>
      httpRequest("PUT", `/api/v1/agents/${agentId}`, updates, userId),
    deleteAgent: (userId, agentId) =>
      httpRequest("DELETE", `/api/v1/agents/${agentId}`, null, userId),

    createConversation: (userId, data) =>
      httpRequest("POST", "/api/v1/conversations", data, userId),
    getConversations: (userId, options = {}) => {
      const { limit = 20, offset = 0 } = options;
      return httpRequest(
        "GET",
        `/api/v1/conversations?limit=${limit}&offset=${offset}`,
        null,
        userId
      ).then((result) => normalizeConversationPage(result, { limit, offset }));
    },
    getConversation: (userId, conversationId) =>
      httpRequest("GET", `/api/v1/conversations/${conversationId}`, null, userId),
    updateConversation: (userId, conversationId, updates) =>
      httpRequest("PUT", `/api/v1/conversations/${conversationId}`, updates, userId),
    deleteConversation: (userId, conversationId) =>
      httpRequest("DELETE", `/api/v1/conversations/${conversationId}`, null, userId),

    getContext: (userId, conversationId, options = {}) => {
      const query = options.compressed ? "?compressed=true" : "";
      return httpRequest(
        "GET",
        `/api/v1/conversations/${conversationId}/context${query}`,
        null,
        userId
      );
    },
    summarize: (userId, cid, params) =>
      streamRequest("POST", `/api/v1/conversations/${cid}/summarize`, params, userId),

    addMessage: (userId, conversationId, data) =>
      httpRequest("POST", `/api/v1/conversations/${conversationId}/messages`, data, userId),
    getMessages: (userId, conversationId) =>
      httpRequest("GET", `/api/v1/conversations/${conversationId}/messages`, null, userId),
    getMessage: (userId, messageId) =>
      httpRequest("GET", `/api/v1/messages/${messageId}`, null, userId),
    updateMessage: (userId, messageId, updates) =>
      httpRequest("PUT", `/api/v1/messages/${messageId}`, updates, userId),
    deleteMessage: (userId, messageId) =>
      httpRequest("DELETE", `/api/v1/messages/${messageId}`, null, userId),

    createTool: (data) => httpRequest("POST", "/api/v1/tools", data, null),
    getTool: (toolId) => httpRequest("GET", `/api/v1/tools/${toolId}`, null, null),
    getTools: (userId) => httpRequest("GET", "/api/v1/tools", null, userId),
    updateTool: (toolId, updates) => httpRequest("PUT", `/api/v1/tools/${toolId}`, updates, null),
    deleteTool: (toolId) => httpRequest("DELETE", `/api/v1/tools/${toolId}`, null, null),

    createPrompt: (data) => httpRequest("POST", "/api/v1/prompts", data, null),
    getPrompt: (promptId) => httpRequest("GET", `/api/v1/prompts/${promptId}`, null, null),
    getPrompts: () => httpRequest("GET", "/api/v1/prompts", null, null),
    updatePrompt: (promptId, updates) =>
      httpRequest("PUT", `/api/v1/prompts/${promptId}`, updates, null),
    deletePrompt: (promptId) => httpRequest("DELETE", `/api/v1/prompts/${promptId}`, null, null),

    addResource: (userId, data) => httpRequest("POST", "/api/v1/resources", data, userId),
    getResource: (userId, resourceId) =>
      httpRequest("GET", `/api/v1/resources/${resourceId}`, null, userId),
    updateResource: (userId, resourceId, updates) =>
      httpRequest("PUT", `/api/v1/resources/${resourceId}`, updates, userId),
    getResourcesByAgent: (userId, agentId) =>
      httpRequest("GET", `/api/v1/agents/${agentId}/resources`, null, userId),
    getResourcesByConversation: (userId, conversationId) =>
      httpRequest("GET", `/api/v1/conversations/${conversationId}/resources`, null, userId),
    deleteResource: (userId, resourceId) =>
      httpRequest("DELETE", `/api/v1/resources/${resourceId}`, null, userId),

    addVectors: (userId, conversationId, vectors) =>
      httpRequest("POST", "/api/v1/vectors", { conversationID: conversationId, vectors }, userId),
    getVectorsByConversation: (userId, conversationId) =>
      httpRequest("GET", `/api/v1/conversations/${conversationId}/vectors`, null, userId),
    getVectorsByResource: (userId, resourceId) =>
      httpRequest("GET", `/api/v1/resources/${resourceId}/vectors`, null, userId),
    searchVectors: (params) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined || value === null) continue;
        query.set(key, key === "embedding" ? JSON.stringify(value) : String(value));
      }
      return httpRequest("GET", `/api/v1/vectors/search?${query}`, null, null);
    },
    deleteVectorsByResource: (userId, resourceId) =>
      httpRequest("DELETE", `/api/v1/resources/${resourceId}/vectors`, null, userId),
    deleteVectorsByConversation: (userId, conversationId) =>
      httpRequest("DELETE", `/api/v1/conversations/${conversationId}/vectors`, null, userId),

    searchMessages: (userId, params) =>
      httpRequest("POST", "/api/v1/search/messages", params, userId),
    searchResourceVectors: (userId, params) =>
      httpRequest("POST", "/api/v1/search/vectors", params, userId),
    searchChunks: (userId, params) => httpRequest("POST", "/api/v1/search/chunks", params, userId),
  };
}

const httpClient = buildHttpClient();

export const cmsClient = CMS_URL ? httpClient : directClient;

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
  summarize,
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
  updateResource,
  getResourcesByAgent,
  getResourcesByConversation,
  deleteResource,
  addVectors,
  getVectorsByConversation,
  getVectorsByResource,
  searchVectors,
  deleteVectorsByResource,
  deleteVectorsByConversation,
  searchMessages,
  searchResourceVectors,
  searchChunks,
} = cmsClient;
