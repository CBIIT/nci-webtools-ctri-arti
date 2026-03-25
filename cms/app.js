import { createRequestContext } from "shared/request-context.js";

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

export function createCmsApplication({ service, source = "direct" } = {}) {
  if (!service) {
    throw new Error("cms service is required");
  }

  function normalizeContext(context) {
    return createRequestContext(context, { source });
  }

  function getUserId(context) {
    return normalizeContext(context).userId;
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
      return service.createAgent(getUserId(context), data);
    },

    getAgents(context) {
      return service.getAgents(getUserId(context));
    },

    getAgent(context, agentId) {
      return service.getAgent(getUserId(context), agentId);
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
      return service.createConversation(getUserId(context), data);
    },

    async getConversations(context, options = {}) {
      const requestContext = normalizeContext(context);
      const { limit = 20, offset = 0 } = options;
      const result = await service.getConversations(requestContext.userId, { limit, offset });
      return normalizeConversationPage(result, { limit, offset });
    },

    getConversation(context, conversationId) {
      return service.getConversation(getUserId(context), conversationId);
    },

    updateConversation(context, conversationId, updates) {
      return service.updateConversation(getUserId(context), conversationId, updates);
    },

    deleteConversation(context, conversationId) {
      return service.deleteConversation(getUserId(context), conversationId);
    },

    getContext(context, conversationId, options) {
      return service.getContext(getUserId(context), conversationId, options);
    },

    summarize(context, conversationId, params) {
      const requestContext = normalizeContext(context);
      return service.summarize(requestContext.userId, conversationId, {
        ...params,
        requestId: params?.requestId || requestContext.requestId,
      });
    },

    appendConversationMessage(context, data) {
      return service.appendConversationMessage(getUserId(context), data);
    },

    appendUserMessage(context, data) {
      return service.appendUserMessage(getUserId(context), data);
    },

    appendAssistantMessage(context, data) {
      return service.appendAssistantMessage(getUserId(context), data);
    },

    appendToolResultsMessage(context, data) {
      return service.appendToolResultsMessage(getUserId(context), data);
    },

    getMessages(context, conversationId) {
      return service.getMessages(getUserId(context), conversationId);
    },

    getMessage(context, messageId) {
      return service.getMessage(getUserId(context), messageId);
    },

    updateMessage(context, messageId, updates) {
      return service.updateMessage(getUserId(context), messageId, updates);
    },

    deleteMessage(context, messageId) {
      return service.deleteMessage(getUserId(context), messageId);
    },

    createTool(data) {
      return service.createTool(data);
    },

    getTool(toolId) {
      return service.getTool(toolId);
    },

    getTools(context) {
      return service.getTools(getUserId(context));
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
      return service.storeConversationResource(getUserId(context), data);
    },

    getResource(context, resourceId) {
      return service.getResource(getUserId(context), resourceId);
    },

    updateConversationResource(context, resourceId, updates) {
      return service.updateConversationResource(getUserId(context), resourceId, updates);
    },

    getResourcesByAgent(context, agentId) {
      return service.getResourcesByAgent(getUserId(context), agentId);
    },

    getResourcesByConversation(context, conversationId) {
      return service.getResourcesByConversation(getUserId(context), conversationId);
    },

    deleteConversationResource(context, resourceId) {
      return service.deleteConversationResource(getUserId(context), resourceId);
    },

    storeConversationVectors(context, data) {
      return service.storeConversationVectors(getUserId(context), data);
    },

    getVectorsByConversation(context, conversationId) {
      return service.getVectorsByConversation(getUserId(context), conversationId);
    },

    getVectorsByResource(context, resourceId) {
      return service.getVectorsByResource(getUserId(context), resourceId);
    },

    searchVectors(params) {
      return service.searchVectors(params);
    },

    deleteVectorsByResource(context, resourceId) {
      return service.deleteVectorsByResource(getUserId(context), resourceId);
    },

    deleteVectorsByConversation(context, conversationId) {
      return service.deleteVectorsByConversation(getUserId(context), conversationId);
    },

    searchMessages(context, params) {
      return service.searchMessages(getUserId(context), params);
    },

    searchResourceVectors(context, params) {
      return service.searchResourceVectors(getUserId(context), params);
    },

    searchChunks(context, params) {
      return service.searchChunks(getUserId(context), params);
    },

    getTemplates() {
      return service.getTemplates();
    },

    getTemplate(templateId) {
      return service.getTemplate(templateId);
    },
  };
}
