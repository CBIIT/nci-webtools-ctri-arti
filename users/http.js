import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";
import { routeHandler, sendNotFound, parseAnalyticsQuery, parseUsageQuery } from "shared/utils.js";

export function createUsersRouter({ application } = {}) {
  if (!application) {
    throw new Error("users application is required");
  }

  const api = Router();

  // Users service handles small payloads only (no file uploads or large content)
  api.use(json({ limit: "10mb" }));
  api.use(logRequests());

  api.get(
    "/users",
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
    "/users/resolve",
    routeHandler(async (req, res) => {
      const result = await application.resolveUser(req.query);
      if (!result) return sendNotFound(res, "User");
      res.json(result);
    })
  );

  api.get(
    "/users/:id",
    routeHandler(async (req, res) => {
      const user = await application.getUser(req.params.id);
      if (!user) return sendNotFound(res, "User");
      res.json(user);
    })
  );

  api.post(
    "/users",
    routeHandler(async (req, res) => {
      const user = await application.createUser(req.body);
      res.status(201).json(user);
    })
  );

  api.post(
    "/users/find-or-create",
    routeHandler(async (req, res) => {
      const user = await application.findOrCreateUser(req.body);
      res.status(201).json(user);
    })
  );

  api.put(
    "/users/:id",
    routeHandler(async (req, res) => {
      const user = await application.updateUser(req.params.id, req.body);
      if (!user) return sendNotFound(res, "User");
      res.json(user);
    })
  );

  api.put(
    "/users/:id/profile",
    routeHandler(async (req, res) => {
      const user = await application.updateProfile(req.params.id, req.body);
      if (!user) return sendNotFound(res, "User");
      res.json(user);
    })
  );

  api.delete(
    "/users/:id",
    routeHandler(async (req, res) => {
      const result = await application.deleteUser(req.params.id);
      if (!result) return sendNotFound(res, "User");
      res.json(result);
    })
  );

  api.get(
    "/roles",
    routeHandler(async (_req, res) => {
      const roles = await application.getRoles();
      res.json(roles);
    })
  );

  api.get(
    "/roles/:roleIdentifier/access",
    routeHandler(async (req, res) => {
      const access = await application.getAccessForRole(req.params.roleIdentifier);
      res.json(access);
    })
  );

  api.post(
    "/usage",
    routeHandler(async (req, res) => {
      const result = await application.recordUsage(req.body.userId, req.body.rows);
      res.json(result);
    })
  );

  api.get(
    "/users/:id/usage",
    routeHandler(async (req, res) => {
      const result = await application.getUserUsage(+req.params.id, parseUsageQuery(req.query));
      if (!result) return sendNotFound(res, "User");
      res.json(result);
    })
  );

  api.get(
    "/usage",
    routeHandler(async (req, res) => {
      const result = await application.getUsage({
        ...parseUsageQuery(req.query),
        userId: req.query.userId,
      });
      res.json(result);
    })
  );

  api.get(
    "/analytics",
    routeHandler(async (req, res) => {
      const result = await application.getAnalytics(parseAnalyticsQuery(req.query));
      res.json(result);
    })
  );

  api.post(
    "/budgets/reset",
    routeHandler(async (_req, res) => {
      const result = await application.resetAllBudgets();
      res.json(result);
    })
  );

  api.post(
    "/users/:id/budget/reset",
    routeHandler(async (req, res) => {
      const result = await application.resetUserBudget(req.params.id);
      if (!result) return sendNotFound(res, "User");
      res.json(result);
    })
  );

  api.get(
    "/config",
    routeHandler(async (_req, res) => {
      res.json(application.getConfig());
    })
  );

  api.use(logErrors());

  return api;
}
