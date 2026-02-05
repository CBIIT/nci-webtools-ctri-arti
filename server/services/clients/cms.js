/**
 * CMS Client
 *
 * Provides a unified interface for conversation management that works in both:
 * - Monolith mode (direct function calls when CMS_URL is not set)
 * - Microservice mode (HTTP calls when CMS_URL is set)
 */

import { ConversationService } from "../cms/conversation.js";

const CMS_URL = process.env.CMS_URL;
const directService = new ConversationService();

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

// ===== AGENT METHODS =====

export async function createAgent(userId, data) {
  if (!CMS_URL) {
    return directService.createAgent(userId, data);
  }
  return httpRequest("POST", "/api/agents", data, userId);
}

export async function getAgents(userId) {
  if (!CMS_URL) {
    return directService.getAgents(userId);
  }
  return httpRequest("GET", "/api/agents", null, userId);
}

export async function getAgent(userId, agentId) {
  if (!CMS_URL) {
    return directService.getAgent(userId, agentId);
  }
  return httpRequest("GET", `/api/agents/${agentId}`, null, userId);
}

export async function updateAgent(userId, agentId, updates) {
  if (!CMS_URL) {
    return directService.updateAgent(userId, agentId, updates);
  }
  return httpRequest("PUT", `/api/agents/${agentId}`, updates, userId);
}

export async function deleteAgent(userId, agentId) {
  if (!CMS_URL) {
    return directService.deleteAgent(userId, agentId);
  }
  return httpRequest("DELETE", `/api/agents/${agentId}`, null, userId);
}

// ===== THREAD METHODS =====

export async function createThread(userId, data) {
  if (!CMS_URL) {
    return directService.createThread(userId, data);
  }
  return httpRequest("POST", "/api/threads", data, userId);
}

export async function getThreads(userId, options = {}) {
  if (!CMS_URL) {
    return directService.getThreads(userId, options);
  }
  const { limit = 20, offset = 0 } = options;
  return httpRequest("GET", `/api/threads?limit=${limit}&offset=${offset}`, null, userId);
}

export async function getThread(userId, threadId) {
  if (!CMS_URL) {
    return directService.getThread(userId, threadId);
  }
  return httpRequest("GET", `/api/threads/${threadId}`, null, userId);
}

export async function updateThread(userId, threadId, updates) {
  if (!CMS_URL) {
    return directService.updateThread(userId, threadId, updates);
  }
  return httpRequest("PUT", `/api/threads/${threadId}`, updates, userId);
}

export async function deleteThread(userId, threadId) {
  if (!CMS_URL) {
    return directService.deleteThread(userId, threadId);
  }
  return httpRequest("DELETE", `/api/threads/${threadId}`, null, userId);
}

// ===== MESSAGE METHODS =====

export async function addMessage(userId, threadId, data) {
  if (!CMS_URL) {
    return directService.addMessage(userId, threadId, data);
  }
  return httpRequest("POST", `/api/threads/${threadId}/messages`, data, userId);
}

export async function getMessages(userId, threadId) {
  if (!CMS_URL) {
    return directService.getMessages(userId, threadId);
  }
  return httpRequest("GET", `/api/threads/${threadId}/messages`, null, userId);
}

export async function getMessage(userId, messageId) {
  if (!CMS_URL) {
    return directService.getMessage(userId, messageId);
  }
  // Note: Direct service doesn't have a route for this, falling back to direct
  return directService.getMessage(userId, messageId);
}

export async function updateMessage(userId, messageId, updates) {
  if (!CMS_URL) {
    return directService.updateMessage(userId, messageId, updates);
  }
  return httpRequest("PUT", `/api/messages/${messageId}`, updates, userId);
}

export async function deleteMessage(userId, messageId) {
  if (!CMS_URL) {
    return directService.deleteMessage(userId, messageId);
  }
  return httpRequest("DELETE", `/api/messages/${messageId}`, null, userId);
}

// ===== RESOURCE METHODS =====

export async function addResource(userId, data) {
  if (!CMS_URL) {
    return directService.addResource(userId, data);
  }
  return httpRequest("POST", "/api/resources", data, userId);
}

export async function getResource(userId, resourceId) {
  if (!CMS_URL) {
    return directService.getResource(userId, resourceId);
  }
  return httpRequest("GET", `/api/resources/${resourceId}`, null, userId);
}

export async function getResourcesByThread(userId, threadId) {
  if (!CMS_URL) {
    return directService.getResourcesByThread(userId, threadId);
  }
  return httpRequest("GET", `/api/threads/${threadId}/resources`, null, userId);
}

export async function deleteResource(userId, resourceId) {
  if (!CMS_URL) {
    return directService.deleteResource(userId, resourceId);
  }
  return httpRequest("DELETE", `/api/resources/${resourceId}`, null, userId);
}

// ===== VECTOR METHODS =====

export async function addVectors(userId, threadId, vectors) {
  if (!CMS_URL) {
    return directService.addVectors(userId, threadId, vectors);
  }
  return httpRequest("POST", `/api/threads/${threadId}/vectors`, { vectors }, userId);
}

export async function getVectorsByThread(userId, threadId) {
  if (!CMS_URL) {
    return directService.getVectorsByThread(userId, threadId);
  }
  return httpRequest("GET", `/api/threads/${threadId}/vectors`, null, userId);
}

export async function getVectorsByResource(userId, resourceId) {
  if (!CMS_URL) {
    return directService.getVectorsByResource(userId, resourceId);
  }
  // Note: No HTTP endpoint for this, falling back to direct
  return directService.getVectorsByResource(userId, resourceId);
}

export async function deleteVectorsByThread(userId, threadId) {
  if (!CMS_URL) {
    return directService.deleteVectorsByThread(userId, threadId);
  }
  // Note: No HTTP endpoint for this, falling back to direct
  return directService.deleteVectorsByThread(userId, threadId);
}

// Export a convenience object with all methods
export const cmsClient = {
  createAgent,
  getAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  createThread,
  getThreads,
  getThread,
  updateThread,
  deleteThread,
  addMessage,
  getMessages,
  getMessage,
  updateMessage,
  deleteMessage,
  addResource,
  getResource,
  getResourcesByThread,
  deleteResource,
  addVectors,
  getVectorsByThread,
  getVectorsByResource,
  deleteVectorsByThread,
};
