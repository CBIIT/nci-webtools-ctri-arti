import { getMutationCount } from "shared/utils.js";

import { UserService } from "./user.js";

export function createUsersApplication({ service = new UserService() } = {}) {
  return {
    getUser(id) {
      return service.getUser(id);
    },

    getUserByEmail(email) {
      return service.getUserByEmail(email);
    },

    getUserByApiKey(apiKey) {
      return service.getUserByApiKey(apiKey);
    },

    resolveUser({ id, email, apiKey }) {
      if (apiKey) return service.getUserByApiKey(apiKey);
      if (email) return service.getUserByEmail(email);
      return service.getUser(id);
    },

    resolveIdentity({ sessionUserId, apiKey } = {}) {
      if (apiKey) return service.getUserByApiKey(apiKey);
      if (sessionUserId) return service.getUser(sessionUserId);
      return null;
    },

    findOrCreateUser(data) {
      return service.findOrCreateUser(data);
    },

    getUsers(query) {
      return service.getUsers(query);
    },

    createUser(data) {
      return service.createUser(data);
    },

    updateUser(id, data) {
      return service.updateUser(id, data);
    },

    deleteUser(id) {
      return service.deleteUser(id);
    },

    updateProfile(id, data) {
      return service.updateProfile(id, data);
    },

    getRoles() {
      return service.getRoles();
    },

    getAccessForRole(roleIdentifier) {
      return service.getAccessForRole(roleIdentifier);
    },

    recordUsage(userId, rows) {
      return service.recordUsage(userId, rows);
    },

    getUserUsage(userId, query) {
      return service.getUserUsage(userId, query);
    },

    getUsage(query) {
      return service.getUsage(query);
    },

    getAnalytics(query) {
      return service.getAnalytics(query);
    },

    async resetAllBudgets() {
      const result = await service.resetAllBudgets();
      return {
        success: true,
        updatedUsers: getMutationCount(result),
      };
    },

    async resetUserBudget(userId) {
      const user = await service.resetUserBudget(userId);
      if (!user) return null;

      return {
        success: true,
        user,
      };
    },

    getConfig() {
      return service.getConfig();
    },
  };
}
