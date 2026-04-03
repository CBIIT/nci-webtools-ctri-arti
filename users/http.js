import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";
import { routeHandler } from "shared/utils.js";

export function createUsersRouter({ application } = {}) {
  if (!application) {
    throw new Error("users application is required");
  }

  const api = Router();

  api.use(json({ limit: "10mb" }));
  api.use(logRequests());

  api.get(
    "/v1/users",
    routeHandler(async (req, res) => {
      const { search, limit, offset, sortBy, sortOrder, ...filters } = req.query;
      const result = await application.getUsers({
        search,
        limit: limit ? +limit : undefined,
        offset: offset ? +offset : undefined,
        sortBy,
        sortOrder,
        ...filters,
      });
      res.json(result);
    })
  );

  api.get(
    "/v1/users/resolve",
    routeHandler(async (req, res) => {
      const result = await application.resolveUser(req.query);
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    })
  );

  api.get(
    "/v1/users/:id",
    routeHandler(async (req, res) => {
      const user = await application.getUser(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    })
  );

  api.post(
    "/v1/users",
    routeHandler(async (req, res) => {
      const user = await application.createUser(req.body);
      res.json(user);
    })
  );

  api.post(
    "/v1/users/find-or-create",
    routeHandler(async (req, res) => {
      const user = await application.findOrCreateUser(req.body);
      res.json(user);
    })
  );

  api.put(
    "/v1/users/:id",
    routeHandler(async (req, res) => {
      const user = await application.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    })
  );

  api.put(
    "/v1/users/:id/profile",
    routeHandler(async (req, res) => {
      const user = await application.updateProfile(req.params.id, req.body);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    })
  );

  api.delete(
    "/v1/users/:id",
    routeHandler(async (req, res) => {
      const result = await application.deleteUser(req.params.id);
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    })
  );

  api.get(
    "/v1/roles",
    routeHandler(async (_req, res) => {
      const roles = await application.getRoles();
      res.json(roles);
    })
  );

  api.get(
    "/v1/roles/:roleIdentifier/access",
    routeHandler(async (req, res) => {
      const access = await application.getAccessForRole(req.params.roleIdentifier);
      res.json(access);
    })
  );

  api.post(
    "/v1/usage",
    routeHandler(async (req, res) => {
      const result = await application.recordUsage(req.body.userId, req.body.rows);
      res.json(result);
    })
  );

  api.get(
    "/v1/users/:id/usage",
    routeHandler(async (req, res) => {
      const result = await application.getUserUsage(+req.params.id, {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        tz: req.query.tz,
        type: req.query.type,
        limit: req.query.limit ? +req.query.limit : undefined,
        offset: req.query.offset ? +req.query.offset : undefined,
      });
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    })
  );

  api.get(
    "/v1/usage",
    routeHandler(async (req, res) => {
      const result = await application.getUsage({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        tz: req.query.tz,
        userId: req.query.userId,
        type: req.query.type,
        limit: req.query.limit ? +req.query.limit : undefined,
        offset: req.query.offset ? +req.query.offset : undefined,
      });
      res.json(result);
    })
  );

  api.get(
    "/v1/analytics",
    routeHandler(async (req, res) => {
      const result = await application.getAnalytics({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        tz: req.query.tz,
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

  api.post(
    "/v1/budgets/reset",
    routeHandler(async (_req, res) => {
      const result = await application.resetAllBudgets();
      res.json(result);
    })
  );

  api.post(
    "/v1/users/:id/budget/reset",
    routeHandler(async (req, res) => {
      const result = await application.resetUserBudget(req.params.id);
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    })
  );

  api.get(
    "/v1/config",
    routeHandler(async (_req, res) => {
      res.json(application.getConfig());
    })
  );

  api.use(logErrors());

  return api;
}
