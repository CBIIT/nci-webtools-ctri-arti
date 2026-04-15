import { buildQueryString, requestJson } from "../shared/clients/http.js";

export function createUsersRemote({ baseUrl, fetchImpl = fetch }) {
  function requestUsers(path, options = {}) {
    return requestJson(fetchImpl, {
      url: `${baseUrl}${path}`,
      errorMessage: "Users request failed",
      ...options,
    });
  }

  const remote = {
    getUser: (id) => requestUsers(`/api/v1/users/${id}`),
    resolveUser: (query) => requestUsers(`/api/v1/users/resolve${buildQueryString(query)}`),
    resolveIdentity: ({ sessionUserId, apiKey } = {}) => {
      if (apiKey) return remote.getUserByApiKey(apiKey);
      if (sessionUserId) return remote.getUser(sessionUserId);
      return null;
    },
    getUserByEmail: (email) => remote.resolveUser({ email }),
    getUserByApiKey: (apiKey) => remote.resolveUser({ apiKey }),
    findOrCreateUser: (data) =>
      requestUsers("/api/v1/users/find-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: data,
      }),
    getUsers: (query) => requestUsers(`/api/v1/users${buildQueryString(query)}`),
    createUser: (data) =>
      requestUsers("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: data,
      }),
    updateUser: (id, data) =>
      requestUsers(`/api/v1/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: data,
      }),
    deleteUser: (id) => requestUsers(`/api/v1/users/${id}`, { method: "DELETE" }),
    updateProfile: (id, data) =>
      requestUsers(`/api/v1/users/${id}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: data,
      }),
    getRoles: () => requestUsers("/api/v1/roles"),
    getAccessForRole: (roleIdentifier) =>
      requestUsers(`/api/v1/roles/${encodeURIComponent(roleIdentifier)}/access`),
    recordUsage: (userId, rows) =>
      requestUsers("/api/v1/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { userId, rows },
      }),
    getUserUsage: (userId, query) =>
      requestUsers(`/api/v1/users/${userId}/usage${buildQueryString(query)}`),
    getUsage: (query) => requestUsers(`/api/v1/usage${buildQueryString(query)}`),
    getAnalytics: (query) => requestUsers(`/api/v1/analytics${buildQueryString(query)}`),
    resetAllBudgets: () => requestUsers("/api/v1/budgets/reset", { method: "POST" }),
    resetUserBudget: (userId) =>
      requestUsers(`/api/v1/users/${userId}/budget/reset`, {
        method: "POST",
      }),
    getConfig: () => requestUsers("/api/v1/config"),
    isToolEnabled: (toolName) =>
      requestUsers(`/api/v1/config/enabledFeature/${encodeURIComponent(toolName)}`),
  };

  return remote;
}
