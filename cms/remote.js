import { createRequestContext, requestContextToInternalHeaders } from "shared/request-context.js";

import {
  buildQueryString,
  createPlainError,
  createStatusError,
  requestJson,
  streamNdjsonRequest,
} from "../shared/clients/http.js";

function createContextHeaders(userIdOrContext, source = "internal-http") {
  const context = createRequestContext(userIdOrContext, { source });
  return {
    "Content-Type": "application/json",
    ...requestContextToInternalHeaders(context),
  };
}

export function createCmsRemote({ baseUrl, fetchImpl = fetch }) {
  function requestCms(path, context, options = {}) {
    return requestJson(fetchImpl, {
      url: `${baseUrl}${path}`,
      headers: createContextHeaders(context),
      errorMessage: "CMS request failed",
      createError: createStatusError,
      ...options,
    });
  }

  async function* streamCms(path, context, options = {}) {
    for await (const event of streamNdjsonRequest(fetchImpl, {
      url: `${baseUrl}${path}`,
      headers: createContextHeaders(context),
      errorMessage: "CMS stream request failed",
      createError: createPlainError,
      ...options,
    })) {
      if (event.error) throw new Error(event.error);
      yield event;
    }
  }

  return {
    // Agents
    createAgent: (context, data) =>
      requestCms("/api/v1/agents", context, { method: "POST", body: data }),
    getAgents: (context) => requestCms("/api/v1/agents", context),
    getAgent: (context, agentId) => requestCms(`/api/v1/agents/${agentId}`, context),
    updateAgent: (context, agentId, updates) =>
      requestCms(`/api/v1/agents/${agentId}`, context, { method: "PUT", body: updates }),
    deleteAgent: (context, agentId) =>
      requestCms(`/api/v1/agents/${agentId}`, context, { method: "DELETE" }),

    // Conversations
    createConversation: (context, data) =>
      requestCms("/api/v1/conversations", context, { method: "POST", body: data }),
    getConversations: (context, options = {}) => {
      const { limit = 20, offset = 0 } = options;
      return requestCms(`/api/v1/conversations${buildQueryString({ limit, offset })}`, context);
    },
    getConversation: (context, conversationId) =>
      requestCms(`/api/v1/conversations/${conversationId}`, context),
    updateConversation: (context, conversationId, updates) =>
      requestCms(`/api/v1/conversations/${conversationId}`, context, {
        method: "PUT",
        body: updates,
      }),
    deleteConversation: (context, conversationId) =>
      requestCms(`/api/v1/conversations/${conversationId}`, context, { method: "DELETE" }),

    // Context + Summarize
    getContext: (context, conversationId, options = {}) => {
      const query = buildQueryString({ compressed: options.compressed ? true : undefined });
      return requestCms(`/api/v1/conversations/${conversationId}/context${query}`, context);
    },
    summarize: (context, conversationId, params) =>
      streamCms(`/api/v1/conversations/${conversationId}/summarize`, context, {
        method: "POST",
        body: params,
      }),

    // Messages
    appendConversationMessage: (context, data) =>
      requestCms(`/api/v1/conversations/${data.conversationId}/messages`, context, {
        method: "POST",
        body: data,
      }),
    getMessages: (context, conversationId) =>
      requestCms(`/api/v1/conversations/${conversationId}/messages`, context),
    getMessage: (context, messageId) => requestCms(`/api/v1/messages/${messageId}`, context),
    updateMessage: (context, messageId, updates) =>
      requestCms(`/api/v1/messages/${messageId}`, context, { method: "PUT", body: updates }),
    deleteMessage: (context, messageId) =>
      requestCms(`/api/v1/messages/${messageId}`, context, { method: "DELETE" }),

    // Tools (no user context)
    createTool: (data) => requestCms("/api/v1/tools", null, { method: "POST", body: data }),
    getTool: (toolId) => requestCms(`/api/v1/tools/${toolId}`, null),
    getTools: (context) => requestCms("/api/v1/tools", context),
    updateTool: (toolId, updates) =>
      requestCms(`/api/v1/tools/${toolId}`, null, { method: "PUT", body: updates }),
    deleteTool: (toolId) => requestCms(`/api/v1/tools/${toolId}`, null, { method: "DELETE" }),

    // Prompts (no user context)
    createPrompt: (data) => requestCms("/api/v1/prompts", null, { method: "POST", body: data }),
    getPrompt: (promptId) => requestCms(`/api/v1/prompts/${promptId}`, null),
    getPrompts: () => requestCms("/api/v1/prompts", null),
    updatePrompt: (promptId, updates) =>
      requestCms(`/api/v1/prompts/${promptId}`, null, { method: "PUT", body: updates }),
    deletePrompt: (promptId) =>
      requestCms(`/api/v1/prompts/${promptId}`, null, { method: "DELETE" }),

    // Resources
    storeConversationResource: (context, data) =>
      requestCms("/api/v1/resources", context, { method: "POST", body: data }),
    getResource: (context, resourceId) => requestCms(`/api/v1/resources/${resourceId}`, context),
    updateConversationResource: (context, resourceId, updates) =>
      requestCms(`/api/v1/resources/${resourceId}`, context, { method: "PUT", body: updates }),
    getResourcesByAgent: (context, agentId) =>
      requestCms(`/api/v1/agents/${agentId}/resources`, context),
    getResourcesByConversation: (context, conversationId) =>
      requestCms(`/api/v1/conversations/${conversationId}/resources`, context),
    deleteConversationResource: (context, resourceId) =>
      requestCms(`/api/v1/resources/${resourceId}`, context, { method: "DELETE" }),

    // Vectors
    storeConversationVectors: (context, data) =>
      requestCms(`/api/v1/conversations/${data.conversationId}/vectors`, context, {
        method: "POST",
        body: { vectors: data.vectors },
      }),
    getVectorsByConversation: (context, conversationId) =>
      requestCms(`/api/v1/conversations/${conversationId}/vectors`, context),
    getVectorsByResource: (context, resourceId) =>
      requestCms(`/api/v1/resources/${resourceId}/vectors`, context),
    searchVectors: (params) => {
      const query = buildQueryString(params, {
        serializeValue: (key, value) => (key === "embedding" ? JSON.stringify(value) : value),
      });
      return requestCms(`/api/v1/vectors/search${query}`, null);
    },
    deleteVectorsByResource: (context, resourceId) =>
      requestCms(`/api/v1/resources/${resourceId}/vectors`, context, { method: "DELETE" }),
    deleteVectorsByConversation: (context, conversationId) =>
      requestCms(`/api/v1/conversations/${conversationId}/vectors`, context, { method: "DELETE" }),

    // Search
    searchMessages: (context, params) =>
      requestCms("/api/v1/search/messages", context, { method: "POST", body: params }),
    searchResourceVectors: (context, params) =>
      requestCms("/api/v1/search/vectors", context, { method: "POST", body: params }),
    searchChunks: (context, params) =>
      requestCms("/api/v1/search/chunks", context, { method: "POST", body: params }),
  };
}
