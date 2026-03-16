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
const DIRECT_METHOD_NAMES = [
  "getUser",
  "resolveUser",
  "findOrCreateUser",
  "getUsers",
  "createUser",
  "updateUser",
  "deleteUser",
  "updateProfile",
  "getRoles",
  "recordUsage",
  "getUserUsage",
  "getUsage",
  "getAnalytics",
  "resetAllBudgets",
  "resetUserBudget",
  "getConfig",
];

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
      const [{ createUsersApplication }, { UserService }] = await Promise.all([
        import("users/app.js"),
        import("users/user.js"),
      ]);

      return createUsersApplication({ service: new UserService() });
    })();
  }
  return directClientPromise;
}

function buildHttpClient() {
  return {
    getUser: (id) => httpRequest("GET", `/api/v1/users/${id}`),
    resolveUser: (query) => httpRequest("GET", `/api/v1/users/resolve${buildQueryString(query)}`),
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

const directClient = Object.fromEntries(
  DIRECT_METHOD_NAMES.map((methodName) => [
    methodName,
    async (...args) => (await getDirectClient())[methodName](...args),
  ])
);

function getUserByEmail(email) {
  return usersClient.resolveUser({ email });
}

function getUserByApiKey(apiKey) {
  return usersClient.resolveUser({ apiKey });
}

const httpClient = buildHttpClient();

export const usersClient = USERS_URL ? httpClient : directClient;

export const {
  getUser,
  resolveUser,
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

export { getUserByEmail, getUserByApiKey };
