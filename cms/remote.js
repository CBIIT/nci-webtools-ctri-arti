import { createRequestContext, requestContextToInternalHeaders } from "shared/request-context.js";

import { parseNdjsonStream } from "../shared/clients/ndjson.js";

function normalizeClientContext(userIdOrContext, source = "internal-http") {
  return createRequestContext(userIdOrContext, { source });
}

function createHeaders(userIdOrContext) {
  const context = normalizeClientContext(userIdOrContext);
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

async function httpRequest(baseUrl, method, path, body, userIdOrContext) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: createHeaders(userIdOrContext),
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

async function* streamRequest(baseUrl, method, path, body, userIdOrContext) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: createHeaders(userIdOrContext),
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

export function createCmsRemote({ baseUrl }) {
  return {
    createAgent: (context, data) => httpRequest(baseUrl, "POST", "/api/v1/agents", data, context),
    getAgents: (context) => httpRequest(baseUrl, "GET", "/api/v1/agents", null, context),
    getAgent: (context, agentId) =>
      httpRequest(baseUrl, "GET", `/api/v1/agents/${agentId}`, null, context),
    updateAgent: (context, agentId, updates) =>
      httpRequest(baseUrl, "PUT", `/api/v1/agents/${agentId}`, updates, context),
    deleteAgent: (context, agentId) =>
      httpRequest(baseUrl, "DELETE", `/api/v1/agents/${agentId}`, null, context),

    createConversation: (context, data) =>
      httpRequest(baseUrl, "POST", "/api/v1/conversations", data, context),
    getConversations: (context, options = {}) => {
      const { limit = 20, offset = 0 } = options;
      return httpRequest(
        baseUrl,
        "GET",
        `/api/v1/conversations?limit=${limit}&offset=${offset}`,
        null,
        context
      ).then((result) => normalizeConversationPage(result, { limit, offset }));
    },
    getConversation: (context, conversationId) =>
      httpRequest(baseUrl, "GET", `/api/v1/conversations/${conversationId}`, null, context),
    updateConversation: (context, conversationId, updates) =>
      httpRequest(baseUrl, "PUT", `/api/v1/conversations/${conversationId}`, updates, context),
    deleteConversation: (context, conversationId) =>
      httpRequest(baseUrl, "DELETE", `/api/v1/conversations/${conversationId}`, null, context),

    getContext: (context, conversationId, options = {}) => {
      const query = options.compressed ? "?compressed=true" : "";
      return httpRequest(
        baseUrl,
        "GET",
        `/api/v1/conversations/${conversationId}/context${query}`,
        null,
        context
      );
    },
    summarize: (context, conversationId, params) =>
      streamRequest(
        baseUrl,
        "POST",
        `/api/v1/conversations/${conversationId}/summarize`,
        params,
        context
      ),

    appendConversationMessage: (context, data) =>
      httpRequest(
        baseUrl,
        "POST",
        `/api/v1/conversations/${data.conversationId}/messages`,
        data,
        context
      ),
    appendUserMessage: (context, data) =>
      httpRequest(
        baseUrl,
        "POST",
        `/api/v1/conversations/${data.conversationId}/messages`,
        { ...data, role: "user" },
        context
      ),
    appendAssistantMessage: (context, data) =>
      httpRequest(
        baseUrl,
        "POST",
        `/api/v1/conversations/${data.conversationId}/messages`,
        { ...data, role: "assistant" },
        context
      ),
    appendToolResultsMessage: (context, data) =>
      httpRequest(
        baseUrl,
        "POST",
        `/api/v1/conversations/${data.conversationId}/messages`,
        { ...data, role: "user" },
        context
      ),
    getMessages: (context, conversationId) =>
      httpRequest(
        baseUrl,
        "GET",
        `/api/v1/conversations/${conversationId}/messages`,
        null,
        context
      ),
    getMessage: (context, messageId) =>
      httpRequest(baseUrl, "GET", `/api/v1/messages/${messageId}`, null, context),
    updateMessage: (context, messageId, updates) =>
      httpRequest(baseUrl, "PUT", `/api/v1/messages/${messageId}`, updates, context),
    deleteMessage: (context, messageId) =>
      httpRequest(baseUrl, "DELETE", `/api/v1/messages/${messageId}`, null, context),

    createTool: (data) => httpRequest(baseUrl, "POST", "/api/v1/tools", data, null),
    getTool: (toolId) => httpRequest(baseUrl, "GET", `/api/v1/tools/${toolId}`, null, null),
    getTools: (context) => httpRequest(baseUrl, "GET", "/api/v1/tools", null, context),
    updateTool: (toolId, updates) =>
      httpRequest(baseUrl, "PUT", `/api/v1/tools/${toolId}`, updates, null),
    deleteTool: (toolId) => httpRequest(baseUrl, "DELETE", `/api/v1/tools/${toolId}`, null, null),

    createPrompt: (data) => httpRequest(baseUrl, "POST", "/api/v1/prompts", data, null),
    getPrompt: (promptId) => httpRequest(baseUrl, "GET", `/api/v1/prompts/${promptId}`, null, null),
    getPrompts: () => httpRequest(baseUrl, "GET", "/api/v1/prompts", null, null),
    updatePrompt: (promptId, updates) =>
      httpRequest(baseUrl, "PUT", `/api/v1/prompts/${promptId}`, updates, null),
    deletePrompt: (promptId) =>
      httpRequest(baseUrl, "DELETE", `/api/v1/prompts/${promptId}`, null, null),

    storeConversationResource: (context, data) =>
      httpRequest(baseUrl, "POST", "/api/v1/resources", data, context),
    getResource: (context, resourceId) =>
      httpRequest(baseUrl, "GET", `/api/v1/resources/${resourceId}`, null, context),
    updateConversationResource: (context, resourceId, updates) =>
      httpRequest(baseUrl, "PUT", `/api/v1/resources/${resourceId}`, updates, context),
    getResourcesByAgent: (context, agentId) =>
      httpRequest(baseUrl, "GET", `/api/v1/agents/${agentId}/resources`, null, context),
    getResourcesByConversation: (context, conversationId) =>
      httpRequest(
        baseUrl,
        "GET",
        `/api/v1/conversations/${conversationId}/resources`,
        null,
        context
      ),
    deleteConversationResource: (context, resourceId) =>
      httpRequest(baseUrl, "DELETE", `/api/v1/resources/${resourceId}`, null, context),

    storeConversationVectors: (context, data) =>
      httpRequest(
        baseUrl,
        "POST",
        "/api/v1/vectors",
        { conversationID: data.conversationId, vectors: data.vectors },
        context
      ),
    getVectorsByConversation: (context, conversationId) =>
      httpRequest(baseUrl, "GET", `/api/v1/conversations/${conversationId}/vectors`, null, context),
    getVectorsByResource: (context, resourceId) =>
      httpRequest(baseUrl, "GET", `/api/v1/resources/${resourceId}/vectors`, null, context),
    searchVectors: (params) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params || {})) {
        if (value === undefined || value === null) continue;
        query.set(key, key === "embedding" ? JSON.stringify(value) : String(value));
      }
      return httpRequest(baseUrl, "GET", `/api/v1/vectors/search?${query}`, null, null);
    },
    deleteVectorsByResource: (context, resourceId) =>
      httpRequest(baseUrl, "DELETE", `/api/v1/resources/${resourceId}/vectors`, null, context),
    deleteVectorsByConversation: (context, conversationId) =>
      httpRequest(
        baseUrl,
        "DELETE",
        `/api/v1/conversations/${conversationId}/vectors`,
        null,
        context
      ),

    searchMessages: (context, params) =>
      httpRequest(baseUrl, "POST", "/api/v1/search/messages", params, context),
    searchResourceVectors: (context, params) =>
      httpRequest(baseUrl, "POST", "/api/v1/search/vectors", params, context),
    searchChunks: (context, params) =>
      httpRequest(baseUrl, "POST", "/api/v1/search/chunks", params, context),
  };
}
