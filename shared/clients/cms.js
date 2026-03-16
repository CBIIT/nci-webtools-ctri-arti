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
import { createRequestContext, requestContextToInternalHeaders } from "../request-context.js";

const CMS_URL = process.env.CMS_URL;
let directClientPromise;
const DIRECT_METHOD_NAMES = [
  "createAgent",
  "getAgents",
  "getAgent",
  "updateAgent",
  "deleteAgent",
  "createConversation",
  "getConversations",
  "getConversation",
  "updateConversation",
  "deleteConversation",
  "getContext",
  "appendConversationMessage",
  "appendUserMessage",
  "appendAssistantMessage",
  "appendToolResultsMessage",
  "getMessages",
  "getMessage",
  "updateMessage",
  "deleteMessage",
  "createTool",
  "getTool",
  "getTools",
  "updateTool",
  "deleteTool",
  "createPrompt",
  "getPrompt",
  "getPrompts",
  "updatePrompt",
  "deletePrompt",
  "storeConversationResource",
  "getResource",
  "updateConversationResource",
  "getResourcesByAgent",
  "getResourcesByConversation",
  "deleteConversationResource",
  "storeConversationVectors",
  "getVectorsByConversation",
  "getVectorsByResource",
  "searchVectors",
  "deleteVectorsByResource",
  "deleteVectorsByConversation",
  "searchMessages",
  "searchResourceVectors",
  "searchChunks",
];

function normalizeClientContext(userIdOrContext, source) {
  return createRequestContext(userIdOrContext, { source });
}

function createHeaders(userIdOrContext) {
  const context = normalizeClientContext(userIdOrContext, "internal-http");
  return {
    "Content-Type": "application/json",
    ...requestContextToInternalHeaders(context),
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
      const [{ createCmsApplication }, { ConversationService }, { invoke }] = await Promise.all([
        import("cms/app.js"),
        import("cms/conversation.js"),
        import("./gateway.js"),
      ]);

      ConversationService.setInvoker(invoke);
      return createCmsApplication({
        service: new ConversationService(),
        source: "direct",
      });
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

const directClient = Object.fromEntries(
  DIRECT_METHOD_NAMES.map((methodName) => [
    methodName,
    async (...args) => (await getDirectClient())[methodName](...args),
  ])
);

directClient.summarize = async function* (...args) {
  yield* (await getDirectClient()).summarize(...args);
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

    appendConversationMessage: (userId, data) =>
      httpRequest("POST", `/api/v1/conversations/${data.conversationId}/messages`, data, userId),
    appendUserMessage: (userId, data) =>
      httpRequest(
        "POST",
        `/api/v1/conversations/${data.conversationId}/messages`,
        { ...data, role: "user" },
        userId
      ),
    appendAssistantMessage: (userId, data) =>
      httpRequest(
        "POST",
        `/api/v1/conversations/${data.conversationId}/messages`,
        { ...data, role: "assistant" },
        userId
      ),
    appendToolResultsMessage: (userId, data) =>
      httpRequest(
        "POST",
        `/api/v1/conversations/${data.conversationId}/messages`,
        { ...data, role: "user" },
        userId
      ),
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

    storeConversationResource: (userId, data) => httpRequest("POST", "/api/v1/resources", data, userId),
    getResource: (userId, resourceId) =>
      httpRequest("GET", `/api/v1/resources/${resourceId}`, null, userId),
    updateConversationResource: (userId, resourceId, updates) =>
      httpRequest("PUT", `/api/v1/resources/${resourceId}`, updates, userId),
    getResourcesByAgent: (userId, agentId) =>
      httpRequest("GET", `/api/v1/agents/${agentId}/resources`, null, userId),
    getResourcesByConversation: (userId, conversationId) =>
      httpRequest("GET", `/api/v1/conversations/${conversationId}/resources`, null, userId),
    deleteConversationResource: (userId, resourceId) =>
      httpRequest("DELETE", `/api/v1/resources/${resourceId}`, null, userId),

    storeConversationVectors: (userId, data) =>
      httpRequest(
        "POST",
        "/api/v1/vectors",
        { conversationID: data.conversationId, vectors: data.vectors },
        userId
      ),
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
  appendConversationMessage,
  appendUserMessage,
  appendAssistantMessage,
  appendToolResultsMessage,
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
  storeConversationResource,
  getResource,
  updateConversationResource,
  getResourcesByAgent,
  getResourcesByConversation,
  deleteConversationResource,
  storeConversationVectors,
  getVectorsByConversation,
  getVectorsByResource,
  searchVectors,
  deleteVectorsByResource,
  deleteVectorsByConversation,
  searchMessages,
  searchResourceVectors,
  searchChunks,
} = cmsClient;
