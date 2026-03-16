import { createRequestContext } from "shared/request-context.js";

import { ConversationService } from "./conversation.js";

function createAppError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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

export function createCmsApplication({ service = new ConversationService(), source = "direct" } = {}) {
  function normalizeContext(context) {
    return createRequestContext(context, { source });
  }

  async function requireEditableAgent(context, agentId) {
    const existingAgent = await service.getAgent(context.userId, agentId);
    if (!existingAgent) {
      throw createAppError(404, "Agent not found");
    }
    if (existingAgent.userID === null) {
      throw createAppError(403, "Cannot modify global agent");
    }
    return existingAgent;
  }

  return {
    createAgent(context, data) {
      return service.createAgent(normalizeContext(context).userId, data);
    },

    getAgents(context) {
      return service.getAgents(normalizeContext(context).userId);
    },

    getAgent(context, agentId) {
      return service.getAgent(normalizeContext(context).userId, agentId);
    },

    async updateAgent(context, agentId, updates) {
      const requestContext = normalizeContext(context);
      await requireEditableAgent(requestContext, agentId);
      return service.updateAgent(requestContext.userId, agentId, updates);
    },

    async deleteAgent(context, agentId) {
      const requestContext = normalizeContext(context);
      const existingAgent = await service.getAgent(requestContext.userId, agentId);
      if (!existingAgent) return 0;
      if (existingAgent.userID === null) {
        throw createAppError(403, "Cannot modify global agent");
      }
      return service.deleteAgent(requestContext.userId, agentId);
    },

    createConversation(context, data) {
      return service.createConversation(normalizeContext(context).userId, data);
    },

    async getConversations(context, options = {}) {
      const requestContext = normalizeContext(context);
      const { limit = 20, offset = 0 } = options;
      const result = await service.getConversations(requestContext.userId, { limit, offset });
      return normalizeConversationPage(result, { limit, offset });
    },

    getConversation(context, conversationId) {
      return service.getConversation(normalizeContext(context).userId, conversationId);
    },

    updateConversation(context, conversationId, updates) {
      return service.updateConversation(normalizeContext(context).userId, conversationId, updates);
    },

    deleteConversation(context, conversationId) {
      return service.deleteConversation(normalizeContext(context).userId, conversationId);
    },

    getContext(context, conversationId, options) {
      return service.getContext(normalizeContext(context).userId, conversationId, options);
    },

    summarize(context, conversationId, params) {
      const requestContext = normalizeContext(context);
      return service.summarize(requestContext.userId, conversationId, {
        ...params,
        requestId: params?.requestId || requestContext.requestId,
      });
    },

    appendConversationMessage(context, data) {
      return service.appendConversationMessage(normalizeContext(context).userId, data);
    },

    appendUserMessage(context, data) {
      return service.appendUserMessage(normalizeContext(context).userId, data);
    },

    appendAssistantMessage(context, data) {
      return service.appendAssistantMessage(normalizeContext(context).userId, data);
    },

    appendToolResultsMessage(context, data) {
      return service.appendToolResultsMessage(normalizeContext(context).userId, data);
    },

    getMessages(context, conversationId) {
      return service.getMessages(normalizeContext(context).userId, conversationId);
    },

    getMessage(context, messageId) {
      return service.getMessage(normalizeContext(context).userId, messageId);
    },

    updateMessage(context, messageId, updates) {
      return service.updateMessage(normalizeContext(context).userId, messageId, updates);
    },

    deleteMessage(context, messageId) {
      return service.deleteMessage(normalizeContext(context).userId, messageId);
    },

    createTool(data) {
      return service.createTool(data);
    },

    getTool(toolId) {
      return service.getTool(toolId);
    },

    getTools(context) {
      return service.getTools(normalizeContext(context).userId);
    },

    updateTool(toolId, updates) {
      return service.updateTool(toolId, updates);
    },

    deleteTool(toolId) {
      return service.deleteTool(toolId);
    },

    createPrompt(data) {
      return service.createPrompt(data);
    },

    getPrompt(promptId) {
      return service.getPrompt(promptId);
    },

    getPrompts(options) {
      return service.getPrompts(options);
    },

    updatePrompt(promptId, updates) {
      return service.updatePrompt(promptId, updates);
    },

    deletePrompt(promptId) {
      return service.deletePrompt(promptId);
    },

    storeConversationResource(context, data) {
      return service.storeConversationResource(normalizeContext(context).userId, data);
    },

    getResource(context, resourceId) {
      return service.getResource(normalizeContext(context).userId, resourceId);
    },

    updateConversationResource(context, resourceId, updates) {
      return service.updateConversationResource(
        normalizeContext(context).userId,
        resourceId,
        updates
      );
    },

    getResourcesByAgent(context, agentId) {
      return service.getResourcesByAgent(normalizeContext(context).userId, agentId);
    },

    getResourcesByConversation(context, conversationId) {
      return service.getResourcesByConversation(normalizeContext(context).userId, conversationId);
    },

    deleteConversationResource(context, resourceId) {
      return service.deleteConversationResource(normalizeContext(context).userId, resourceId);
    },

    storeConversationVectors(context, data) {
      return service.storeConversationVectors(normalizeContext(context).userId, data);
    },

    getVectorsByConversation(context, conversationId) {
      return service.getVectorsByConversation(normalizeContext(context).userId, conversationId);
    },

    getVectorsByResource(context, resourceId) {
      return service.getVectorsByResource(normalizeContext(context).userId, resourceId);
    },

    searchVectors(params) {
      return service.searchVectors(params);
    },

    deleteVectorsByResource(context, resourceId) {
      return service.deleteVectorsByResource(normalizeContext(context).userId, resourceId);
    },

    deleteVectorsByConversation(context, conversationId) {
      return service.deleteVectorsByConversation(normalizeContext(context).userId, conversationId);
    },

    searchMessages(context, params) {
      return service.searchMessages(normalizeContext(context).userId, params);
    },

    searchResourceVectors(context, params) {
      return service.searchResourceVectors(normalizeContext(context).userId, params);
    },

    searchChunks(context, params) {
      return service.searchChunks(normalizeContext(context).userId, params);
    },
  };
}
