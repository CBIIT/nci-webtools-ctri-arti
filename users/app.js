import { UserService } from "./user.js";

function countAffected(result) {
  return result?.length ?? result?.rowCount ?? result?.affectedRows ?? result?.changes ?? 0;
}

export function createUsersApplication({ service = new UserService() } = {}) {
  return {
    getUser(id) {
      return service.getUser(id);
    },

    resolveUser({ id, email, apiKey }) {
      if (apiKey) return service.getUserByApiKey(apiKey);
      if (email) return service.getUserByEmail(email);
      return service.getUser(id);
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
        updatedUsers: countAffected(result),
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
