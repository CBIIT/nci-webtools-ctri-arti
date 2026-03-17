import { getUsersModule } from "./compose.js";

async function callUsers(method, ...args) {
  return (await getUsersModule())[method](...args);
}

export { getUsersModule };

export const getUser = (...args) => callUsers("getUser", ...args);
export const resolveUser = (...args) => callUsers("resolveUser", ...args);
export const resolveIdentity = (...args) => callUsers("resolveIdentity", ...args);
export const findOrCreateUser = (...args) => callUsers("findOrCreateUser", ...args);
export const getUsers = (...args) => callUsers("getUsers", ...args);
export const createUser = (...args) => callUsers("createUser", ...args);
export const updateUser = (...args) => callUsers("updateUser", ...args);
export const deleteUser = (...args) => callUsers("deleteUser", ...args);
export const updateProfile = (...args) => callUsers("updateProfile", ...args);
export const getRoles = (...args) => callUsers("getRoles", ...args);
export const recordUsage = (...args) => callUsers("recordUsage", ...args);
export const getUserUsage = (...args) => callUsers("getUserUsage", ...args);
export const getUsage = (...args) => callUsers("getUsage", ...args);
export const getAnalytics = (...args) => callUsers("getAnalytics", ...args);
export const resetAllBudgets = (...args) => callUsers("resetAllBudgets", ...args);
export const resetUserBudget = (...args) => callUsers("resetUserBudget", ...args);
export const getConfig = (...args) => callUsers("getConfig", ...args);
