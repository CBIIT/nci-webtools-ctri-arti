import { Router } from "express";
import logger from "shared/logger.js";

import { requireRole } from "../../auth.js";
import { sendUsageLimitChangeEmail } from "../../integrations/email.js";
import { getAuthenticatedUser, routeHandler } from "../utils.js";

export function createAdminRouter({
  modules,
  sendUsageLimitChangeEmailImpl = sendUsageLimitChangeEmail,
  now = () => new Date(),
} = {}) {
  if (!modules?.users) {
    throw new Error("users module is required");
  }

  const { users } = modules;
  const api = Router();

  api.get(
    "/admin/users",
    requireRole("admin"),
    routeHandler(async (req, res) => {
      const { search, limit, sortBy, sortOrder, ...filters } = req.query;
      const result = await users.getUsers({
        search,
        limit: limit ? +limit : undefined,
        offset: req.query.offset ? +req.query.offset : undefined,
        sortBy,
        sortOrder,
        ...filters,
      });
      res.json(result);
    })
  );

  api.get(
    "/admin/users/:id",
    requireRole("admin"),
    routeHandler(async (req, res) => {
      const user = await users.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    })
  );

  api.post(
    "/admin/profile",
    requireRole(),
    routeHandler(async (req, res) => {
      const currentUser = getAuthenticatedUser(req);
      const user = await users.updateProfile(currentUser.id, req.body);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    })
  );

  api.post(
    "/admin/users",
    requireRole("admin"),
    routeHandler(async (req, res) => {
      const { id } = req.body;
      const existingUser = id ? await users.getUser(id) : null;
      const user = id ? await users.updateUser(id, req.body) : await users.createUser(req.body);
      if (!user) return res.status(404).json({ error: "User not found" });

      const budgetChanged = id && existingUser && existingUser.budget !== user.budget;
      if (budgetChanged && user.email) {
        const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "User";
        const effectiveAt = user.updatedAt || now();

        try {
          await sendUsageLimitChangeEmailImpl({
            userName,
            userEmail: user.email,
            previousLimit: existingUser.budget,
            newLimit: user.budget,
            effectiveAt,
          });
        } catch (error) {
          logger.error({
            message: "Failed to send usage limit change email",
            userId: user.id,
            error,
          });
        }
      }

      res.json(user);
    })
  );

  api.delete(
    "/admin/users/:id",
    requireRole("admin"),
    routeHandler(async (req, res) => {
      const result = await users.deleteUser(req.params.id);
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    })
  );

  api.get(
    "/admin/users/:id/usage",
    requireRole("admin"),
    routeHandler(async (req, res) => {
      const result = await users.getUserUsage(+req.params.id, {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        type: req.query.type,
        limit: req.query.limit ? +req.query.limit : undefined,
        offset: req.query.offset ? +req.query.offset : undefined,
      });
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    })
  );

  api.get(
    "/admin/roles",
    requireRole("admin"),
    routeHandler(async (_req, res) => {
      const roles = await users.getRoles();
      res.json(roles);
    })
  );

  api.get(
    "/admin/usage",
    requireRole("admin"),
    routeHandler(async (req, res) => {
      const result = await users.getUsage({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        userId: req.query.userId,
        type: req.query.type,
        limit: req.query.limit ? +req.query.limit : undefined,
        offset: req.query.offset ? +req.query.offset : undefined,
      });
      res.json(result);
    })
  );

  api.post(
    "/admin/usage/reset",
    requireRole("admin"),
    routeHandler(async (_req, res) => {
      const result = await users.resetAllBudgets();
      res.json(result);
    })
  );

  api.post(
    "/admin/users/:id/reset-limit",
    requireRole("admin"),
    routeHandler(async (req, res) => {
      const result = await users.resetUserBudget(req.params.id);
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    })
  );

  api.get(
    "/admin/analytics",
    requireRole("admin"),
    routeHandler(async (req, res) => {
      const result = await users.getAnalytics({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        groupBy: req.query.groupBy,
        userId: req.query.userId,
        type: req.query.type,
        search: req.query.search,
        limit: req.query.limit ? +req.query.limit : undefined,
        offset: req.query.offset ? +req.query.offset : undefined,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        role: req.query.role,
        status: req.query.status,
      });
      res.json(result);
    })
  );

  return api;
}

export default createAdminRouter;
