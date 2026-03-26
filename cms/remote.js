import { createRequestContext, requestContextToInternalHeaders } from "shared/request-context.js";

import {
  buildQueryString,
  createPlainError,
  createStatusError,
  requestJson,
  streamNdjsonRequest,
} from "../shared/clients/http.js";

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

async function httpRequest(fetchImpl, baseUrl, method, path, body, userIdOrContext) {
  return requestJson(fetchImpl, {
    url: `${baseUrl}${path}`,
    method,
    headers: createHeaders(userIdOrContext),
    body,
    errorMessage: "CMS request failed",
    createError: createStatusError,
  });
}

async function* streamRequest(fetchImpl, baseUrl, method, path, body, userIdOrContext) {
  for await (const event of streamNdjsonRequest(fetchImpl, {
    url: `${baseUrl}${path}`,
    method,
    headers: createHeaders(userIdOrContext),
    body,
    errorMessage: "CMS stream request failed",
    createError: createPlainError,
  })) {
    if (event.error) throw new Error(event.error);
    yield event;
  }
}

export function createCmsRemote({ baseUrl, fetchImpl = fetch }) {
  return {
    createAgent: (context, data) =>
      httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/agents", data, context),
    getAgents: (context) =>
      httpRequest(fetchImpl, baseUrl, "GET", "/api/v1/agents", undefined, context),
    getAgent: (context, agentId) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/agents/${agentId}`, undefined, context),
    updateAgent: (context, agentId, updates) =>
      httpRequest(fetchImpl, baseUrl, "PUT", `/api/v1/agents/${agentId}`, updates, context),
    deleteAgent: (context, agentId) =>
      httpRequest(fetchImpl, baseUrl, "DELETE", `/api/v1/agents/${agentId}`, undefined, context),

    createConversation: (context, data) =>
      httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/conversations", data, context),
    getConversations: (context, options = {}) => {
      const { limit = 20, offset = 0 } = options;
      return httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/conversations${buildQueryString({ limit, offset })}`,
        undefined,
        context
      );
    },
    getConversation: (context, conversationId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/conversations/${conversationId}`,
        undefined,
        context
      ),
    updateConversation: (context, conversationId, updates) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "PUT",
        `/api/v1/conversations/${conversationId}`,
        updates,
        context
      ),
    deleteConversation: (context, conversationId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "DELETE",
        `/api/v1/conversations/${conversationId}`,
        undefined,
        context
      ),

    getContext: (context, conversationId, options = {}) => {
      const query = buildQueryString({ compressed: options.compressed ? true : undefined });
      return httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/conversations/${conversationId}/context${query}`,
        undefined,
        context
      );
    },
    summarize: (context, conversationId, params) =>
      streamRequest(
        fetchImpl,
        baseUrl,
        "POST",
        `/api/v1/conversations/${conversationId}/summarize`,
        params,
        context
      ),

    appendConversationMessage: (context, data) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "POST",
        `/api/v1/conversations/${data.conversationId}/messages`,
        data,
        context
      ),
    getMessages: (context, conversationId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/conversations/${conversationId}/messages`,
        undefined,
        context
      ),
    getMessage: (context, messageId) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/messages/${messageId}`, undefined, context),
    updateMessage: (context, messageId, updates) =>
      httpRequest(fetchImpl, baseUrl, "PUT", `/api/v1/messages/${messageId}`, updates, context),
    deleteMessage: (context, messageId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "DELETE",
        `/api/v1/messages/${messageId}`,
        undefined,
        context
      ),

    createTool: (data) => httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/tools", data, null),
    getTool: (toolId) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/tools/${toolId}`, undefined, null),
    getTools: (context) =>
      httpRequest(fetchImpl, baseUrl, "GET", "/api/v1/tools", undefined, context),
    updateTool: (toolId, updates) =>
      httpRequest(fetchImpl, baseUrl, "PUT", `/api/v1/tools/${toolId}`, updates, null),
    deleteTool: (toolId) =>
      httpRequest(fetchImpl, baseUrl, "DELETE", `/api/v1/tools/${toolId}`, undefined, null),

    createPrompt: (data) => httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/prompts", data, null),
    getPrompt: (promptId) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/prompts/${promptId}`, undefined, null),
    getPrompts: () => httpRequest(fetchImpl, baseUrl, "GET", "/api/v1/prompts", undefined, null),
    updatePrompt: (promptId, updates) =>
      httpRequest(fetchImpl, baseUrl, "PUT", `/api/v1/prompts/${promptId}`, updates, null),
    deletePrompt: (promptId) =>
      httpRequest(fetchImpl, baseUrl, "DELETE", `/api/v1/prompts/${promptId}`, undefined, null),

    storeConversationResource: (context, data) =>
      httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/resources", data, context),
    getResource: (context, resourceId) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/resources/${resourceId}`, undefined, context),
    updateConversationResource: (context, resourceId, updates) =>
      httpRequest(fetchImpl, baseUrl, "PUT", `/api/v1/resources/${resourceId}`, updates, context),
    getResourcesByAgent: (context, agentId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/agents/${agentId}/resources`,
        undefined,
        context
      ),
    getResourcesByConversation: (context, conversationId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/conversations/${conversationId}/resources`,
        undefined,
        context
      ),
    deleteConversationResource: (context, resourceId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "DELETE",
        `/api/v1/resources/${resourceId}`,
        undefined,
        context
      ),

    storeConversationVectors: (context, data) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "POST",
        `/api/v1/conversations/${data.conversationId}/vectors`,
        { vectors: data.vectors },
        context
      ),
    getVectorsByConversation: (context, conversationId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/conversations/${conversationId}/vectors`,
        undefined,
        context
      ),
    getVectorsByResource: (context, resourceId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/resources/${resourceId}/vectors`,
        undefined,
        context
      ),
    searchVectors: (params) => {
      const query = buildQueryString(params, {
        serializeValue: (key, value) => (key === "embedding" ? JSON.stringify(value) : value),
      });
      return httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/vectors/search${query}`,
        undefined,
        null
      );
    },
    deleteVectorsByResource: (context, resourceId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "DELETE",
        `/api/v1/resources/${resourceId}/vectors`,
        undefined,
        context
      ),
    deleteVectorsByConversation: (context, conversationId) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "DELETE",
        `/api/v1/conversations/${conversationId}/vectors`,
        undefined,
        context
      ),

    searchMessages: (context, params) =>
      httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/search/messages", params, context),
    searchResourceVectors: (context, params) =>
      httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/search/vectors", params, context),
    searchChunks: (context, params) =>
      httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/search/chunks", params, context),
  };
}
