import db, { Model, Role, Usage, User } from "database";

import { eq, and, or, between, like, sql, sum, count, countDistinct, asc, desc } from "drizzle-orm";
import { Router } from "express";

import { requireRole } from "../middleware.js";
import { resetUsageLimits } from "../scheduler.js";
import { createHttpError, getDateRange, routeHandler } from "../utils.js";

const api = Router();

// ===== Shared helpers =====

function buildSearchConditions(search) {
  if (!search) return undefined;
  const searchTerm = `%${search.toLowerCase()}%`;
  return or(
    like(sql`LOWER(${User.firstName})`, searchTerm),
    like(sql`LOWER(${User.lastName})`, searchTerm),
    like(sql`LOWER(${User.email})`, searchTerm)
  );
}

function getGroupColumn(groupBy) {
  switch (groupBy) {
    case "hour":
      return sql`to_char(${Usage.createdAt}, 'YYYY-MM-DD HH24:00:00')`;
    case "day":
      return sql`${Usage.createdAt}::date`;
    case "week":
      return sql`to_char(${Usage.createdAt}, 'IYYY-IW')`;
    case "month":
      return sql`to_char(${Usage.createdAt}, 'YYYY-MM')`;
    case "user":
      return Usage.userID;
    case "model":
      return Usage.modelID;
    default:
      return sql`${Usage.createdAt}::date`;
  }
}

// ===== User Management =====

api.get(
  "/admin/users",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const search = req.query.search;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder || "DESC";

    const conditions = [];
    const searchCond = buildSearchConditions(search);
    if (searchCond) conditions.push(searchCond);

    // Additional query params as filters (exclude pagination/sort params)
    const reserved = new Set(["search", "limit", "offset", "sortBy", "sortOrder"]);
    for (const [key, value] of Object.entries(req.query)) {
      if (!reserved.has(key) && User[key]) {
        conditions.push(eq(User[key], value));
      }
    }

    const sortMapping = {
      name: User.lastName,
      lastName: User.lastName,
      firstName: User.firstName,
      email: User.email,
      status: User.status,
      role: Role.name,
      budget: User.budget,
      createdAt: User.createdAt,
    };
    const orderCol = sortMapping[sortBy] || User.createdAt;
    const orderFn = sortOrder.toUpperCase() === "ASC" ? asc : desc;

    // Use relational query for includes
    const where = conditions.length ? and(...conditions) : undefined;

    const [{ value: total }] = await db.select({ value: count() }).from(User).where(where);

    const users = await db.query.User.findMany({
      where,
      with: { Role: true },
      limit,
      offset,
      orderBy: orderFn(orderCol),
    });

    res.json({
      data: users,
      meta: { total, limit, offset, search, sortBy, sortOrder },
    });
  })
);

api.get(
  "/admin/users/:id",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const user = await db.query.User.findFirst({
      where: eq(User.id, +req.params.id),
      with: { Role: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

api.post(
  "/admin/profile",
  requireRole(),
  routeHandler(async (req, res, next) => {
    const { session } = req;
    const currentUser = session.user;
    const { firstName, lastName } = req.body;

    const allowedFields = {};
    if (firstName !== undefined) allowedFields.firstName = firstName;
    if (lastName !== undefined) allowedFields.lastName = lastName;

    try {
      const [existing] = await db.select().from(User).where(eq(User.id, currentUser.id)).limit(1);
      if (!existing) return res.status(404).json({ error: "User not found" });

      await db.update(User).set(allowedFields).where(eq(User.id, currentUser.id));
      const updatedUser = await db.query.User.findFirst({
        where: eq(User.id, currentUser.id),
        with: { Role: true },
      });
      res.json(updatedUser);
    } catch (error) {
      console.error("Profile update error:", error);
      next(createHttpError(500, error, "Failed to update profile"));
    }
  })
);

api.post(
  "/admin/users",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const { id, generateApiKey, ...userData } = req.body;

    if (generateApiKey) {
      userData.apiKey = `rsk_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    }

    let user;
    if (id) {
      const [existing] = await db.select().from(User).where(eq(User.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: "User not found" });
      [user] = await db.update(User).set(userData).where(eq(User.id, id)).returning();
    } else {
      [user] = await db.insert(User).values(userData).returning();
    }

    res.json(user);
  })
);

api.delete(
  "/admin/users/:id",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const [existing] = await db.select().from(User).where(eq(User.id, +req.params.id)).limit(1);
    if (!existing) return res.status(404).json({ error: "User not found" });
    await db.delete(User).where(eq(User.id, +req.params.id));
    res.json({ success: true });
  })
);

// ===== Usage =====

api.get(
  "/admin/users/:id/usage",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const userId = +req.params.id;
    const [user] = await db.select().from(User).where(eq(User.id, userId)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { startDate, endDate } = getDateRange(req.query.startDate, req.query.endDate);
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const where = and(eq(Usage.userID, userId), between(Usage.createdAt, startDate, endDate));

    const [{ value: total }] = await db.select({ value: count() }).from(Usage).where(where);

    const rows = await db.query.Usage.findMany({
      where,
      with: { Model: { columns: { id: true, name: true } } },
      orderBy: desc(Usage.createdAt),
      limit,
      offset,
    });

    res.json({
      data: rows.map((usage) => ({
        id: usage.id,
        userID: usage.userID,
        modelID: usage.modelID,
        modelName: usage.Model?.name,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: usage.cost,
        createdAt: usage.createdAt,
      })),
      meta: {
        total,
        limit,
        offset,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          budget: user.budget,
          remaining: user.remaining,
        },
      },
    });
  })
);

api.get(
  "/admin/roles",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const roles = await db.select().from(Role).orderBy(asc(Role.displayOrder));
    res.json(roles);
  })
);

api.get(
  "/admin/usage",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const { startDate, endDate } = getDateRange(req.query.startDate, req.query.endDate);
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const userId = req.query.userId;

    const conditions = [between(Usage.createdAt, startDate, endDate)];
    if (userId) conditions.push(eq(Usage.userID, +userId));
    const where = and(...conditions);

    const [{ value: total }] = await db.select({ value: count() }).from(Usage).where(where);

    const rows = await db.query.Usage.findMany({
      where,
      with: {
        Model: { columns: { id: true, name: true } },
        User: {
          columns: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            budget: true,
            remaining: true,
          },
          with: { Role: { columns: { id: true, name: true } } },
        },
      },
      orderBy: desc(Usage.createdAt),
      limit,
      offset,
    });

    res.json({
      data: rows.map((usage) => ({
        id: usage.id,
        userID: usage.userID,
        modelID: usage.modelID,
        modelName: usage.Model?.name,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cost: usage.cost,
        createdAt: usage.createdAt,
        user: {
          id: usage.User.id,
          email: usage.User.email,
          firstName: usage.User.firstName,
          lastName: usage.User.lastName,
          budget: usage.User.budget,
          remaining: usage.User.remaining,
          role: usage.User.Role?.name,
        },
      })),
      meta: { total, limit, offset },
    });
  })
);

api.post(
  "/admin/usage/reset",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const result = await resetUsageLimits();
    res.json({ success: true, updatedUsers: result.length ?? result.rowCount ?? 0 });
  })
);

api.post(
  "/admin/users/:id/reset-limit",
  requireRole("admin"),
  routeHandler(async (req, res, next) => {
    const userId = +req.params.id;
    try {
      const [user] = await db.select().from(User).where(eq(User.id, userId)).limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });

      const result = await db
        .update(User)
        .set({ remaining: sql`${User.budget}` })
        .where(eq(User.id, userId))
        .returning();

      if (result.length) {
        res.json({ success: true, user: result[0] });
      } else {
        res.status(500).json({ error: "Failed to reset user limit" });
      }
    } catch (error) {
      console.error("Error resetting user limit:", error);
      next(createHttpError(500, error, "An error occurred while resetting the user limit"));
    }
  })
);

// ===== Analytics =====

api.get(
  "/admin/analytics",
  requireRole("admin"),
  routeHandler(async (req, res) => {
    const { startDate, endDate } = getDateRange(req.query.startDate, req.query.endDate);
    const groupBy = req.query.groupBy || "day";
    const userId = req.query.userId;
    const search = req.query.search;
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const sortBy = req.query.sortBy || "totalCost";
    const sortOrder = req.query.sortOrder || "desc";
    const roleFilter = req.query.role;
    const statusFilter = req.query.status;

    const groupCol = getGroupColumn(groupBy);

    const baseConditions = [between(Usage.createdAt, startDate, endDate)];
    if (userId) baseConditions.push(eq(Usage.userID, +userId));

    if (groupBy === "user") {
      // User-grouped analytics with joins
      const joinConditions = [...baseConditions];
      const searchCond = buildSearchConditions(search);
      if (searchCond) joinConditions.push(searchCond);
      if (statusFilter && statusFilter !== "All")
        joinConditions.push(eq(User.status, statusFilter));
      if (roleFilter && roleFilter !== "All") joinConditions.push(eq(Role.name, roleFilter));

      const where = and(...joinConditions);

      // Count distinct users
      const [{ value: totalCount }] = await db
        .select({ value: countDistinct(Usage.userID) })
        .from(Usage)
        .innerJoin(User, eq(Usage.userID, User.id))
        .innerJoin(Role, eq(User.roleID, Role.id))
        .where(where);

      const aggregateSortMapping = {
        totalCost: sum(Usage.cost),
        totalRequests: count(),
        totalInputTokens: sum(Usage.inputTokens),
        totalOutputTokens: sum(Usage.outputTokens),
        estimatedCost: sum(Usage.cost),
        inputTokens: sum(Usage.inputTokens),
        outputTokens: sum(Usage.outputTokens),
        name: User.firstName,
        email: User.email,
        role: Role.name,
      };
      const orderCol = aggregateSortMapping[sortBy] || sum(Usage.cost);
      const orderFn = sortOrder.toUpperCase() === "ASC" ? asc : desc;

      const data = await db
        .select({
          userID: Usage.userID,
          totalCost: sum(Usage.cost),
          totalInputTokens: sum(Usage.inputTokens),
          totalOutputTokens: sum(Usage.outputTokens),
          totalRequests: count(),
          User: {
            id: User.id,
            email: User.email,
            firstName: User.firstName,
            lastName: User.lastName,
            budget: User.budget,
            remaining: User.remaining,
            roleID: User.roleID,
          },
          Role: {
            id: Role.id,
            name: Role.name,
          },
        })
        .from(Usage)
        .innerJoin(User, eq(Usage.userID, User.id))
        .innerJoin(Role, eq(User.roleID, Role.id))
        .where(where)
        .groupBy(
          Usage.userID,
          User.id,
          User.email,
          User.firstName,
          User.lastName,
          User.budget,
          User.remaining,
          User.roleID,
          Role.id,
          Role.name
        )
        .orderBy(orderFn(orderCol))
        .limit(limit)
        .offset(offset);

      return res.json({
        data,
        meta: {
          groupBy,
          search,
          limit,
          offset,
          sortBy,
          sortOrder,
          role: roleFilter,
          total: totalCount,
        },
      });
    }

    if (groupBy === "model") {
      const where = and(...baseConditions);

      const data = await db
        .select({
          modelID: Usage.modelID,
          totalCost: sum(Usage.cost),
          totalInputTokens: sum(Usage.inputTokens),
          totalOutputTokens: sum(Usage.outputTokens),
          totalRequests: count(),
          Model: { name: Model.name },
        })
        .from(Usage)
        .innerJoin(Model, eq(Usage.modelID, Model.id))
        .where(where)
        .groupBy(Usage.modelID, Model.id, Model.name)
        .orderBy(desc(sum(Usage.cost)));

      return res.json({ data, meta: { groupBy } });
    }

    // Time-based grouping (hour, day, week, month)
    const where = and(...baseConditions);

    const data = await db
      .select({
        period: groupCol,
        totalCost: sum(Usage.cost),
        totalInputTokens: sum(Usage.inputTokens),
        totalOutputTokens: sum(Usage.outputTokens),
        totalRequests: count(),
        uniqueUsers: countDistinct(Usage.userID),
      })
      .from(Usage)
      .where(where)
      .groupBy(groupCol)
      .orderBy(desc(groupCol));

    res.json({ data, meta: { groupBy } });
  })
);

export default api;
