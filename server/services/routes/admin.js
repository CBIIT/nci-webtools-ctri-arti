import { Router } from "express";

import { requireRole } from "../../auth.js";
import {
  createUser,
  deleteUser,
  getAnalytics,
  getRoles,
  getUsage,
  getUser,
  getUsers,
  getUserUsage,
  resetAllBudgets,
  resetUserBudget,
  updateProfile,
  updateUser,
} from "../../users.js";
import { getAuthenticatedUser, routeHandler } from "../utils.js";

const api = Router();

api.get(
  "/admin/users",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const { search, limit, offset, sortBy, sortOrder, ...filters } = req.query;
    const result = await getUsers({
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
  "/admin/users/:id",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.post(
  "/admin/profile",
  requireRole(),
  routeHandler(async (req, res) => {
    const currentUser = getAuthenticatedUser(req);
    const user = await updateProfile(currentUser.id, req.body);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.post(
  "/admin/users",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const { id } = req.body;
    const user = id ? await updateUser(id, req.body) : await createUser(req.body);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.delete(
  "/admin/users/:id",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const result = await deleteUser(req.params.id);
    if (!result) return res.status(404).json({ error: "User not found" });
    res.json(result);
  })
);

api.get(
  "/admin/users/:id/usage",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const result = await getUserUsage(+req.params.id, {
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
  "/admin/roles",
  requireRole("admin"),
  routeHandler(async (_req, res) => {
    const roles = await getRoles();
    res.json(roles);
  })
);

api.get(
  "/admin/usage",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const result = await getUsage({
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

api.post(
  "/admin/usage/reset",
  requireRole("admin"),
  routeHandler(async (_req, res) => {
    const result = await resetAllBudgets();
    res.json(result);
  })
);

api.post(
  "/admin/users/:id/reset-limit",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const result = await resetUserBudget(req.params.id);
    if (!result) return res.status(404).json({ error: "User not found" });
    res.json(result);
  })
);

api.get(
  "/admin/analytics",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const result = await getAnalytics({
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

export default api;
