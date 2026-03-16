import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";
import { routeHandler } from "shared/utils.js";

import { createUsersApplication } from "./app.js";
import { UserService } from "./user.js";

const app = createUsersApplication({ service: new UserService() });
const api = Router();

api.use(json({ limit: "10mb" }));
api.use(logRequests());

// ===== Users =====

api.get(
  "/v1/users",
  routeHandler(async (req, res) => {
    const { search, limit, offset, sortBy, sortOrder, ...filters } = req.query;
    const result = await app.getUsers({
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
    const result = await app.resolveUser(req.query);
    if (!result) return res.status(404).json({ error: "User not found" });
    res.json(result);
  })
);

api.get(
  "/v1/users/:id",
  routeHandler(async (req, res) => {
    const user = await app.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.post(
  "/v1/users",
  routeHandler(async (req, res) => {
    const user = await app.createUser(req.body);
    res.json(user);
  })
);

api.post(
  "/v1/users/find-or-create",
  routeHandler(async (req, res) => {
    const user = await app.findOrCreateUser(req.body);
    res.json(user);
  })
);

api.put(
  "/v1/users/:id",
  routeHandler(async (req, res) => {
    const user = await app.updateUser(req.params.id, req.body);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.put(
  "/v1/users/:id/profile",
  routeHandler(async (req, res) => {
    const user = await app.updateProfile(req.params.id, req.body);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.delete(
  "/v1/users/:id",
  routeHandler(async (req, res) => {
    const result = await app.deleteUser(req.params.id);
    if (!result) return res.status(404).json({ error: "User not found" });
    res.json(result);
  })
);

// ===== Roles =====

api.get(
  "/v1/roles",
  routeHandler(async (req, res) => {
    const roles = await app.getRoles();
    res.json(roles);
  })
);

// ===== Usage =====

api.post(
  "/v1/usage",
  routeHandler(async (req, res) => {
    const result = await app.recordUsage(req.body.userId, req.body.rows);
    res.json(result);
  })
);

api.get(
  "/v1/users/:id/usage",
  routeHandler(async (req, res) => {
    const result = await app.getUserUsage(+req.params.id, {
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
    const result = await app.getUsage({
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
    const result = await app.getAnalytics({
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

// ===== Budget =====

api.post(
  "/v1/budgets/reset",
  routeHandler(async (req, res) => {
    const result = await app.resetAllBudgets();
    res.json(result);
  })
);

api.post(
  "/v1/users/:id/budget/reset",
  routeHandler(async (req, res) => {
    const result = await app.resetUserBudget(req.params.id);
    if (!result) return res.status(404).json({ error: "User not found" });
    res.json(result);
  })
);

// ===== Config =====

api.get(
  "/v1/config",
  routeHandler(async (req, res) => {
    res.json(app.getConfig());
  })
);

api.use(logErrors());

export default api;
