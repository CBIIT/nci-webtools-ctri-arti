/**
 * AMS Client
 *
 * Provides a unified interface for agent management that works in both:
 * - Monolith mode (direct function calls when AMS_URL is not set)
 * - Microservice mode (HTTP calls when AMS_URL is set)
 *
 * Uses a factory pattern — the mode is resolved once at module load time.
 */

import { agentManagementService } from "../ams/service.js";

const AMS_URL = process.env.AMS_URL;

function toQueryString(params = {}) {
  const filtered = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null),
  );
  const qs = new URLSearchParams(filtered).toString();
  return qs ? `?${qs}` : "";
}

/**
 * Make an HTTP request to the AMS service
 */
async function httpRequest(method, path, body, userId) {
  const response = await fetch(`${AMS_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": String(userId),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    const err = new Error(error.error || "AMS request failed");
    err.status = response.status;
    throw err;
  }

  return response.json();
}

function buildDirectClient() {
  const s = agentManagementService;
  return {
    // Agents
    createAgent: (userId, data) => s.createAgent(userId, data),
    getAgents: (userId) => s.getAgents(userId),
    getAgent: (userId, agentId) => s.getAgent(userId, agentId),
    updateAgent: (userId, agentId, data) => s.updateAgent(userId, agentId, data),
    deleteAgent: (userId, agentId) => s.deleteAgent(userId, agentId),

    // Models
    getModels: (userId, query) => s.getModels(userId, query),
    getModel: (userId, modelId) => s.getModel(userId, modelId),

    // Tools
    getTools: (userId) => s.getTools(userId),

    // Conversations
    createConversation: (userId, data) => s.createConversation(userId, data),
    getConversations: (userId) => s.getConversations(userId),
    getConversation: (userId, id) => s.getConversation(userId, id),
    chat: (userId, id, data) => s.chat(userId, id, data),
    deleteConversation: (userId, id) => s.deleteConversation(userId, id),

    // Users
    createUser: (userId, data) => s.createUser(userId, data),
    getUsers: (userId, query) => s.getUsers(userId, query),
    getUser: (userId, id) => s.getUser(userId, id),
    updateUser: (userId, id, data) => s.updateUser(userId, id, data),
    deleteUser: (userId, id) => s.deleteUser(userId, id),

    // Usages
    getUsages: (userId, query) => s.getUsages(userId, query),

    // Files
    uploadFile: (userId, file, filename) => s.uploadFile(userId, file, filename),
    getFiles: (userId) => s.getFiles(userId),
    deleteFile: (userId, filename) => s.deleteFile(userId, filename),
  };
}

function buildHttpClient() {
  return {
    // Agents
    createAgent: (userId, data) => httpRequest("POST", "/api/v1/agents", data, userId),
    getAgents: (userId) => httpRequest("GET", "/api/v1/agents", null, userId),
    getAgent: (userId, agentId) => httpRequest("GET", `/api/v1/agents/${agentId}`, null, userId),
    updateAgent: (userId, agentId, data) => httpRequest("PUT", `/api/v1/agents/${agentId}`, data, userId),
    deleteAgent: (userId, agentId) => httpRequest("DELETE", `/api/v1/agents/${agentId}`, null, userId),

    // Models
    getModels: (userId, query) => httpRequest("GET", `/api/v1/models${toQueryString(query)}`, null, userId),
    getModel: (userId, modelId) => httpRequest("GET", `/api/v1/models/${modelId}`, null, userId),

    // Tools
    getTools: (userId) => httpRequest("GET", "/api/v1/tools", null, userId),

    // Conversations
    createConversation: (userId, data) => httpRequest("POST", "/api/v1/conversations", data, userId),
    getConversations: (userId) => httpRequest("GET", "/api/v1/conversations", null, userId),
    getConversation: (userId, id) => httpRequest("GET", `/api/v1/conversations/${id}`, null, userId),
    chat: (userId, id, data) => httpRequest("PUT", `/api/v1/conversations/${id}`, data, userId),
    deleteConversation: (userId, id) => httpRequest("DELETE", `/api/v1/conversations/${id}`, null, userId),

    // Users
    createUser: (userId, data) => httpRequest("POST", "/api/v1/users", data, userId),
    getUsers: (userId, query) => httpRequest("GET", `/api/v1/users${toQueryString(query)}`, null, userId),
    getUser: (userId, id) => httpRequest("GET", `/api/v1/users/${id}`, null, userId),
    updateUser: (userId, id, data) => httpRequest("PUT", `/api/v1/users/${id}`, data, userId),
    deleteUser: (userId, id) => httpRequest("DELETE", `/api/v1/users/${id}`, null, userId),

    // Usages
    getUsages: (userId, query) => httpRequest("GET", `/api/v1/usages${toQueryString(query)}`, null, userId),

    // Files (file upload requires multipart — not supported via simple HTTP client)
    uploadFile: () => { throw new Error("File upload not supported in microservice mode via this client"); },
    getFiles: (userId) => httpRequest("GET", "/api/v1/files", null, userId),
    deleteFile: (userId, filename) => httpRequest("DELETE", "/api/v1/files", { filename }, userId),
  };
}

export const amsClient = AMS_URL ? buildHttpClient() : buildDirectClient();

// Named exports for convenience
export const {
  createAgent,
  getAgents,
  getAgent,
  updateAgent,
  deleteAgent,
  getModels,
  getModel,
  getTools,
  createConversation,
  getConversations,
  getConversation,
  chat,
  deleteConversation,
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getUsages,
  uploadFile,
  getFiles,
  deleteFile,
} = amsClient;
