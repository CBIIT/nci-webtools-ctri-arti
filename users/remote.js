function buildQueryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }
  const str = query.toString();
  return str ? `?${str}` : "";
}

async function httpRequest(fetchImpl, baseUrl, method, path, body) {
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    const err = new Error(error.error || "Users request failed");
    err.status = response.status;
    throw err;
  }

  return response.json();
}

export function createUsersRemote({ baseUrl, fetchImpl = fetch }) {
  const remote = {
    getUser: (id) => httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/users/${id}`),
    resolveUser: (query) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/users/resolve${buildQueryString(query)}`),
    resolveIdentity: ({ sessionUserId, apiKey } = {}) => {
      if (apiKey) return remote.getUserByApiKey(apiKey);
      if (sessionUserId) return remote.getUser(sessionUserId);
      return null;
    },
    getUserByEmail: (email) => remote.resolveUser({ email }),
    getUserByApiKey: (apiKey) => remote.resolveUser({ apiKey }),
    findOrCreateUser: (data) =>
      httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/users/find-or-create", data),
    getUsers: (query) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/users${buildQueryString(query)}`),
    createUser: (data) => httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/users", data),
    updateUser: (id, data) => httpRequest(fetchImpl, baseUrl, "PUT", `/api/v1/users/${id}`, data),
    deleteUser: (id) => httpRequest(fetchImpl, baseUrl, "DELETE", `/api/v1/users/${id}`),
    updateProfile: (id, data) =>
      httpRequest(fetchImpl, baseUrl, "PUT", `/api/v1/users/${id}/profile`, data),
    getRoles: () => httpRequest(fetchImpl, baseUrl, "GET", "/api/v1/roles"),
    recordUsage: (userId, rows) =>
      httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/usage", { userId, rows }),
    getUserUsage: (userId, query) =>
      httpRequest(
        fetchImpl,
        baseUrl,
        "GET",
        `/api/v1/users/${userId}/usage${buildQueryString(query)}`
      ),
    getUsage: (query) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/usage${buildQueryString(query)}`),
    getAnalytics: (query) =>
      httpRequest(fetchImpl, baseUrl, "GET", `/api/v1/analytics${buildQueryString(query)}`),
    resetAllBudgets: () => httpRequest(fetchImpl, baseUrl, "POST", "/api/v1/budgets/reset"),
    resetUserBudget: (userId) =>
      httpRequest(fetchImpl, baseUrl, "POST", `/api/v1/users/${userId}/budget/reset`),
    getConfig: () => httpRequest(fetchImpl, baseUrl, "GET", "/api/v1/config"),
  };

  return remote;
}
