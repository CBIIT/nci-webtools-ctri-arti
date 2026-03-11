/**
 * AMS Client
 *
 * Provides a unified interface for agent management that works in both:
 * - Monolith mode (mounts AMS router directly when AMS_URL is not set)
 * - Microservice mode (HTTP calls when AMS_URL is set)
 *
 * Uses a factory pattern — the mode is resolved once at module load time.
 */

import { v1Router } from "ams/api.js";

const AMS_URL = process.env.AMS_URL;

async function httpRequest(method, path, body, userId) {
  const response = await fetch(`${AMS_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(userId && { "X-User-Id": String(userId) }),
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

function buildHttpClient() {
  return {
    // Files
    uploadFile: (userId, data) => httpRequest("POST", "/api/v1/files", data, userId),
    listFiles: (userId) => httpRequest("GET", "/api/v1/files", null, userId),
    deleteFile: (userId, data) => httpRequest("DELETE", "/api/v1/files", data, userId),

    // Tools
    createTool: (userId, data) => httpRequest("POST", "/api/v1/tools", data, userId),
    getTools: (userId, query) => {
      const qs = query?.type ? `?type=${query.type}` : "";
      return httpRequest("GET", `/api/v1/tools${qs}`, null, userId);
    },
    getTool: (userId, toolId) => httpRequest("GET", `/api/v1/tools/${toolId}`, null, userId),
    updateTool: (userId, toolId, data) =>
      httpRequest("PUT", `/api/v1/tools/${toolId}`, data, userId),
    deleteTool: (userId, toolId) => httpRequest("DELETE", `/api/v1/tools/${toolId}`, null, userId),

    // Agents
    createAgent: (userId, data) => httpRequest("POST", "/api/v1/agents", data, userId),
    getAgents: (userId) => httpRequest("GET", "/api/v1/agents", null, userId),
    getAgent: (userId, agentId) => httpRequest("GET", `/api/v1/agents/${agentId}`, null, userId),
    updateAgent: (userId, agentId, data) =>
      httpRequest("PUT", `/api/v1/agents/${agentId}`, data, userId),
    deleteAgent: (userId, agentId) =>
      httpRequest("DELETE", `/api/v1/agents/${agentId}`, null, userId),

    // Models
    getModels: (userId, query) => {
      const qs = query?.type ? `?type=${query.type}` : "";
      return httpRequest("GET", `/api/v1/models${qs}`, null, userId);
    },
    getModel: (userId, modelId) => httpRequest("GET", `/api/v1/models/${modelId}`, null, userId),

    // Conversations
    createConversation: (userId, data) =>
      httpRequest("POST", "/api/v1/conversations", data, userId),
    getConversations: (userId) => httpRequest("GET", "/api/v1/conversations", null, userId),
    getConversation: (userId, id) =>
      httpRequest("GET", `/api/v1/conversations/${id}`, null, userId),
    chat: (userId, id, data) => httpRequest("PUT", `/api/v1/conversations/${id}`, data, userId),
    deleteConversation: (userId, id) =>
      httpRequest("DELETE", `/api/v1/conversations/${id}`, null, userId),

    // Usage
    getUsages: (userId, query) => {
      const params = new URLSearchParams();
      if (query?.userID) params.set("userID", query.userID);
      if (query?.agentID) params.set("agentID", query.agentID);
      if (query?.startDate) params.set("startDate", query.startDate);
      if (query?.endDate) params.set("endDate", query.endDate);
      const qs = params.toString() ? `?${params}` : "";
      return httpRequest("GET", `/api/v1/usages${qs}`, null, userId);
    },
  };
}

export const amsClient = AMS_URL ? buildHttpClient() : null;

/**
 * In monolith mode (no AMS_URL), mount this router on the server's Express app.
 * In microservice mode, use amsClient instead.
 */
export const amsRouter = AMS_URL ? null : v1Router;
