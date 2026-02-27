import db, { Model, Role, Usage, User } from "database";

import { Router } from "express";


const { fn, col, Op, where: sequelizeWhere } = db.Sequelize;
import { requireRole } from "../middleware.js";
import { resetUsageLimits } from "../scheduler.js";
import { createHttpError, getDateRange, routeHandler } from "../utils.js";

const api = Router();

// ===== Shared helpers =====

function buildSearchConditions(search) {
  if (!search) return {};
  const searchTerm = `%${search.toLowerCase()}%`;
  return {
    [Op.or]: [
      sequelizeWhere(fn("LOWER", col("firstName")), Op.like, searchTerm),
      sequelizeWhere(fn("LOWER", col("lastName")), Op.like, searchTerm),
      sequelizeWhere(fn("LOWER", col("email")), Op.like, searchTerm),
    ],
  };
}

function getGroupColumn(groupBy) {
  switch (groupBy) {
    case "hour":
      return fn("DATE_FORMAT", col("createdAt"), "%Y-%m-%d %H:00:00");
    case "day":
      return fn("DATE", col("createdAt"));
    case "week":
      return fn("YEARWEEK", col("createdAt"));
    case "month":
      return fn("DATE_FORMAT", col("createdAt"), "%Y-%m");
    case "user":
      return col("userID");
    case "model":
      return col("modelID");
    default:
      return fn("DATE", col("createdAt"));
  }
}

const aggregateAttributes = [
  [fn("SUM", col("cost")), "totalCost"],
  [fn("SUM", col("inputTokens")), "totalInputTokens"],
  [fn("SUM", col("outputTokens")), "totalOutputTokens"],
  [fn("COUNT", col("*")), "totalRequests"],
];

function buildUserAnalyticsQuery(baseQuery, { search, roleFilter, statusFilter, sortBy, sortOrder, limit, offset }) {
  const userWhere = { ...buildSearchConditions(search) };
  if (statusFilter && statusFilter !== "All") {
    userWhere.status = statusFilter;
  }

  const roleWhere = {};
  if (roleFilter && roleFilter !== "All") {
    roleWhere.name = roleFilter;
  }

  const sortMapping = {
    name: ["User", "firstName"],
    email: ["User", "email"],
    role: ["User->Role", "name"],
    totalCost: [fn("SUM", col("cost"))],
    totalRequests: [fn("COUNT", col("*"))],
    totalInputTokens: [fn("SUM", col("inputTokens"))],
    totalOutputTokens: [fn("SUM", col("outputTokens"))],
    estimatedCost: [fn("SUM", col("cost"))],
    inputTokens: [fn("SUM", col("inputTokens"))],
    outputTokens: [fn("SUM", col("outputTokens"))],
  };

  const orderBy = sortMapping[sortBy] || [fn("SUM", col("cost"))];
  const orderDirection = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const includeOpts = [
    {
      model: User,
      attributes: ["id", "email", "firstName", "lastName", "budget", "remaining", "roleID"],
      include: [{ model: Role, attributes: ["name"], where: roleWhere }],
      where: userWhere,
    },
  ];

  return { userWhere, roleWhere, includeOpts, orderBy, orderDirection };
}

// ===== User Management =====

api.get("/admin/users", requireRole("admin"), routeHandler(async (req, res) => {
  const search = req.query.search;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const sortBy = req.query.sortBy || "createdAt";
  const sortOrder = req.query.sortOrder || "DESC";

  const where = { ...req.query };
  delete where.search;
  delete where.limit;
  delete where.offset;
  delete where.sortBy;
  delete where.sortOrder;

  if (search) {
    Object.assign(where, buildSearchConditions(search));
  }

  const sortMapping = {
    name: ["lastName"],
    lastName: ["lastName"],
    firstName: ["firstName"],
    email: ["email"],
    status: ["status"],
    role: [{ model: Role }, "name"],
    budget: ["budget"],
    createdAt: ["createdAt"],
  };

  const orderBy = sortMapping[sortBy] || ["createdAt"];
  const orderDirection = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const { count, rows: users } = await User.findAndCountAll({
    where,
    include: [{ model: Role }],
    limit,
    offset,
    order: [[...orderBy, orderDirection]],
  });

  res.json({
    data: users,
    meta: { total: count, limit, offset, search, sortBy, sortOrder },
  });
}));

api.get("/admin/users/:id", requireRole("admin"), routeHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    include: [{ model: Role }],
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
}));

api.post("/admin/profile", requireRole(), routeHandler(async (req, res, next) => {
  const { session } = req;
  const currentUser = session.user;
  const { firstName, lastName } = req.body;

  const allowedFields = { firstName, lastName };
  Object.keys(allowedFields).forEach((key) => {
    if (allowedFields[key] === undefined) delete allowedFields[key];
  });

  try {
    const user = await User.findByPk(currentUser.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    await user.update(allowedFields);
    const updatedUser = await User.findByPk(currentUser.id, { include: [{ model: Role }] });
    res.json(updatedUser);
  } catch (error) {
    console.error("Profile update error:", error);
    next(createHttpError(500, error, "Failed to update profile"));
  }
}));

api.post("/admin/users", requireRole("admin"), routeHandler(async (req, res) => {
  const { id, generateApiKey, ...userData } = req.body;

  if (generateApiKey) {
    userData.apiKey = `rsk_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  }

  let user;
  if (id) {
    user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    await user.update(userData);
  } else {
    user = await User.create(userData);
  }

  res.json(user);
}));

api.delete("/admin/users/:id", requireRole("admin"), routeHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  await user.destroy();
  res.json({ success: true });
}));

// ===== Usage =====

api.get("/admin/users/:id/usage", requireRole("admin"), routeHandler(async (req, res) => {
  const userId = req.params.id;
  const user = await User.findByPk(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { startDate, endDate } = getDateRange(req.query.startDate, req.query.endDate);
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  const { count, rows } = await Usage.findAndCountAll({
    where: { userID: userId, createdAt: { [Op.between]: [startDate, endDate] } },
    include: [{ model: Model, attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"]],
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
      total: count,
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
}));

api.get("/admin/roles", requireRole("admin"), routeHandler(async (req, res) => {
  const roles = await Role.findAll({ order: [["displayOrder"]] });
  res.json(roles);
}));

api.get("/admin/usage", requireRole("admin"), routeHandler(async (req, res) => {
  const { startDate, endDate } = getDateRange(req.query.startDate, req.query.endDate);
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.query.userId;

  const where = { createdAt: { [Op.between]: [startDate, endDate] } };
  if (userId) where.userID = userId;

  const { count, rows } = await Usage.findAndCountAll({
    where,
    include: [
      { model: Model, attributes: ["id", "name"] },
      {
        model: User,
        attributes: ["id", "email", "firstName", "lastName", "budget", "remaining"],
        include: [{ model: Role, attributes: ["id", "name"] }],
      },
    ],
    order: [["createdAt", "DESC"]],
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
    meta: { total: count, limit, offset },
  });
}));

api.post("/admin/usage/reset", requireRole("admin"), routeHandler(async (req, res) => {
  const [updatedCount] = await resetUsageLimits();
  res.json({ success: true, updatedUsers: updatedCount });
}));

api.post("/admin/users/:id/reset-limit", requireRole("admin"), routeHandler(async (req, res, next) => {
  const userId = req.params.id;
  try {
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const [updated] = await User.update(
      { remaining: User.sequelize.col("budget") },
      { where: { id: userId } }
    );

    if (updated) {
      const updatedUser = await User.findByPk(userId);
      res.json({ success: true, user: updatedUser });
    } else {
      res.status(500).json({ error: "Failed to reset user limit" });
    }
  } catch (error) {
    console.error("Error resetting user limit:", error);
    next(createHttpError(500, error, "An error occurred while resetting the user limit"));
  }
}));

// ===== Analytics =====

api.get("/admin/analytics", requireRole("admin"), routeHandler(async (req, res) => {
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

  const baseQuery = {
    where: {
      createdAt: { [Op.between]: [startDate, endDate] },
      ...(userId && { userID: userId }),
    },
  };

  if (groupBy === "user") {
    const { userWhere, roleWhere, includeOpts, orderBy, orderDirection } =
      buildUserAnalyticsQuery(baseQuery, { search, roleFilter, statusFilter, sortBy, sortOrder, limit, offset });

    const totalCount = await Usage.count({
      ...baseQuery,
      include: [
        {
          model: User,
          where: userWhere,
          include: [{ model: Role, where: roleWhere }],
        },
      ],
      distinct: true,
      col: "userID",
    });

    const data = await Usage.findAll({
      ...baseQuery,
      subQuery: false,
      attributes: ["userID", ...aggregateAttributes],
      include: includeOpts,
      group: [
        "userID",
        "User.id",
        "User.email",
        "User.firstName",
        "User.lastName",
        "User.budget",
        "User.remaining",
        "User.roleID",
        "User->Role.id",
        "User->Role.name",
      ],
      order: [[...orderBy, orderDirection]],
      limit,
      offset,
    });

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
    const data = await Usage.findAll({
      ...baseQuery,
      attributes: ["modelID", ...aggregateAttributes],
      include: [{ model: Model, attributes: ["name"] }],
      group: ["modelID", "Model.id", "Model.name"],
      order: [[fn("SUM", col("cost")), "DESC"]],
    });
    return res.json({ data, meta: { groupBy } });
  }

  // Time-based grouping (hour, day, week, month)
  const data = await Usage.findAll({
    ...baseQuery,
    attributes: [
      [groupCol, "period"],
      ...aggregateAttributes,
      [fn("COUNT", fn("DISTINCT", col("userID"))), "uniqueUsers"],
    ],
    group: [groupCol],
    order: [[groupCol, "DESC"]],
    raw: true,
  });

  res.json({ data, meta: { groupBy } });
}));

export default api;
