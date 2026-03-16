/**
 * Users Client
 *
 * Provides a unified interface for user/role/usage operations that works in both:
 * - Monolith mode (direct function calls when USERS_URL is not set)
 * - Microservice mode (HTTP calls when USERS_URL is set)
 *
 * Uses a factory pattern — the mode is resolved once at module load time.
 */

const USERS_URL = process.env.USERS_URL;
let directClientPromise;

async function httpRequest(method, path, body) {
  const response = await fetch(`${USERS_URL}${path}`, {
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

function buildQueryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }
  const str = query.toString();
  return str ? `?${str}` : "";
}

async function getDirectClient() {
  if (!directClientPromise) {
    directClientPromise = (async () => {
      const { UserService } = await import("users/user.js");
      const service = new UserService();
      return {
        getUser: (id) => service.getUser(id),
        getUserByEmail: (email) => service.getUserByEmail(email),
        getUserByApiKey: (apiKey) => service.getUserByApiKey(apiKey),
        findOrCreateUser: (data) => service.findOrCreateUser(data),
        getUsers: (query) => service.getUsers(query),
        createUser: (data) => service.createUser(data),
        updateUser: (id, data) => service.updateUser(id, data),
        deleteUser: (id) => service.deleteUser(id),
        updateProfile: (id, data) => service.updateProfile(id, data),
        getRoles: () => service.getRoles(),
        recordUsage: (userId, rows) => service.recordUsage(userId, rows),
        getUserUsage: (userId, query) => service.getUserUsage(userId, query),
        getUsage: (query) => service.getUsage(query),
        getAnalytics: (query) => service.getAnalytics(query),
        resetAllBudgets: () => service.resetAllBudgets(),
        resetUserBudget: (userId) => service.resetUserBudget(userId),
        getConfig: () => service.getConfig(),
      };
    })();
  }
  return directClientPromise;
}

function buildHttpClient() {
  return {
    getUser: (id) => httpRequest("GET", `/api/v1/users/${id}`),
    getUserByEmail: (email) =>
      httpRequest("GET", `/api/v1/users/resolve${buildQueryString({ email })}`),
    getUserByApiKey: (apiKey) =>
      httpRequest("GET", `/api/v1/users/resolve${buildQueryString({ apiKey })}`),
    findOrCreateUser: (data) => httpRequest("POST", "/api/v1/users/find-or-create", data),
    getUsers: (query) => httpRequest("GET", `/api/v1/users${buildQueryString(query)}`),
    createUser: (data) => httpRequest("POST", "/api/v1/users", data),
    updateUser: (id, data) => httpRequest("PUT", `/api/v1/users/${id}`, data),
    deleteUser: (id) => httpRequest("DELETE", `/api/v1/users/${id}`),
    updateProfile: (id, data) => httpRequest("PUT", `/api/v1/users/${id}/profile`, data),
    getRoles: () => httpRequest("GET", "/api/v1/roles"),
    recordUsage: (userId, rows) => httpRequest("POST", "/api/v1/usage", { userId, rows }),
    getUserUsage: (userId, query) =>
      httpRequest("GET", `/api/v1/users/${userId}/usage${buildQueryString(query)}`),
    getUsage: (query) => httpRequest("GET", `/api/v1/usage${buildQueryString(query)}`),
    getAnalytics: (query) => httpRequest("GET", `/api/v1/analytics${buildQueryString(query)}`),
    resetAllBudgets: () => httpRequest("POST", "/api/v1/budgets/reset"),
    resetUserBudget: (userId) => httpRequest("POST", `/api/v1/users/${userId}/budget/reset`),
    getConfig: () => httpRequest("GET", "/api/v1/config"),
  };
}

const directClient = {
  getUser: async (id) => (await getDirectClient()).getUser(id),
  getUserByEmail: async (email) => (await getDirectClient()).getUserByEmail(email),
  getUserByApiKey: async (apiKey) => (await getDirectClient()).getUserByApiKey(apiKey),
  findOrCreateUser: async (data) => (await getDirectClient()).findOrCreateUser(data),
  getUsers: async (query) => (await getDirectClient()).getUsers(query),
  createUser: async (data) => (await getDirectClient()).createUser(data),
  updateUser: async (id, data) => (await getDirectClient()).updateUser(id, data),
  deleteUser: async (id) => (await getDirectClient()).deleteUser(id),
  updateProfile: async (id, data) => (await getDirectClient()).updateProfile(id, data),
  getRoles: async () => (await getDirectClient()).getRoles(),
  recordUsage: async (userId, rows) => (await getDirectClient()).recordUsage(userId, rows),
  getUserUsage: async (userId, query) => (await getDirectClient()).getUserUsage(userId, query),
  getUsage: async (query) => (await getDirectClient()).getUsage(query),
  getAnalytics: async (query) => (await getDirectClient()).getAnalytics(query),
  resetAllBudgets: async () => (await getDirectClient()).resetAllBudgets(),
  resetUserBudget: async (userId) => (await getDirectClient()).resetUserBudget(userId),
  getConfig: async () => (await getDirectClient()).getConfig(),
};

const httpClient = buildHttpClient();

export const usersClient = USERS_URL ? httpClient : directClient;

export const {
  getUser,
  getUserByEmail,
  getUserByApiKey,
  findOrCreateUser,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  updateProfile,
  getRoles,
  recordUsage,
  getUserUsage,
  getUsage,
  getAnalytics,
  resetAllBudgets,
  resetUserBudget,
  getConfig,
} = usersClient;
