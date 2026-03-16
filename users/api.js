import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";
import { routeHandler } from "shared/utils.js";

import { UserService } from "./user.js";

const service = new UserService();
const api = Router();

api.use(json({ limit: "10mb" }));
api.use(logRequests());

// ===== Users =====

api.get(
  "/v1/users",
  routeHandler(async (req, res) => {
    const { search, limit, offset, sortBy, sortOrder, ...filters } = req.query;
    const result = await service.getUsers({
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
    const result = req.query.apiKey
      ? await service.getUserByApiKey(req.query.apiKey)
      : await service.getUser(req.query.id);
    if (!result) return res.status(404).json({ error: "User not found" });
    res.json(result);
  })
);

api.get(
  "/v1/users/:id",
  routeHandler(async (req, res) => {
    const user = await service.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.post(
  "/v1/users",
  routeHandler(async (req, res) => {
    const user = await service.createUser(req.body);
    res.json(user);
  })
);

api.post(
  "/v1/users/find-or-create",
  routeHandler(async (req, res) => {
    const user = await service.findOrCreateUser(req.body);
    res.json(user);
  })
);

api.put(
  "/v1/users/:id",
  routeHandler(async (req, res) => {
    const user = await service.updateUser(req.params.id, req.body);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.put(
  "/v1/users/:id/profile",
  routeHandler(async (req, res) => {
    const user = await service.updateProfile(req.params.id, req.body);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.delete(
  "/v1/users/:id",
  routeHandler(async (req, res) => {
    const result = await service.deleteUser(req.params.id);
    if (!result) return res.status(404).json({ error: "User not found" });
    res.json(result);
  })
);

// ===== Roles =====

api.get(
  "/v1/roles",
  routeHandler(async (req, res) => {
    const roles = await service.getRoles();
    res.json(roles);
  })
);

// ===== Usage =====

api.post(
  "/v1/usage",
  routeHandler(async (req, res) => {
    const result = await service.recordUsage(req.body.userId, req.body.rows);
    res.json(result);
  })
);

api.get(
  "/v1/users/:id/usage",
  routeHandler(async (req, res) => {
    const result = await service.getUserUsage(+req.params.id, {
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
  "/v1/usage",
  routeHandler(async (req, res) => {
    const result = await service.getUsage({
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

api.get(
  "/v1/analytics",
  routeHandler(async (req, res) => {
    const result = await service.getAnalytics({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy,
      userId: req.query.userId,
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

// ===== Budget =====

api.post(
  "/v1/budgets/reset",
  routeHandler(async (req, res) => {
    const result = await service.resetAllBudgets();
    res.json({ success: true, updatedUsers: result.length ?? result.rowCount ?? 0 });
  })
);

api.post(
  "/v1/users/:id/budget/reset",
  routeHandler(async (req, res) => {
    const user = await service.resetUserBudget(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  })
);

// ===== Config =====

api.get(
  "/v1/config",
  routeHandler(async (req, res) => {
    res.json(service.getConfig());
  })
);

api.use(logErrors());

export default api;
