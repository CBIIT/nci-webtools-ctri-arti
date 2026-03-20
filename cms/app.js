import { createRequestContext } from "shared/request-context.js";

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

    updateAgent(context, agentId, updates) {
      return service.updateAgent(getUserId(context), agentId, updates);
    },

    deleteAgent(context, agentId) {
      return service.deleteAgent(getUserId(context), agentId);
    },

    createConversation(context, data) {
      return service.createConversation(getUserId(context), data);
    },

    getConversations(context, options = {}) {
      return service.getConversations(getUserId(context), options);
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

    getPrompts() {
      return service.getPrompts();
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
  };
}
