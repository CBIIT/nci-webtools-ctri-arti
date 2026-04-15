import db, { Configuration, Model, Role, Usage, User } from "database";
import { randomBytes } from "node:crypto";

import {
  eq,
  and,
  or,
  between,
  like,
  sql,
  sum,
  count,
  countDistinct,
  asc,
  desc,
  isNotNull,
} from "drizzle-orm";
import { DISABLED_TOOLS_CONFIG_KEY, isToolEnabledFromDisabledValue } from "shared/app-config.js";
import { describeCron, USAGE_RESET_SCHEDULE } from "shared/cron.js";
import { getDateRange, hasOwn } from "shared/utils.js";

// ===== Private helpers =====

function serializeUtcTimestamp(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

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
      return sql`to_char(date_trunc('hour', ${Usage.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
    case "day":
      return sql`to_char(date_trunc('day', ${Usage.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
    case "week":
      return sql`to_char(${Usage.createdAt}, 'IYYY-IW')`;
    case "month":
      return sql`to_char(${Usage.createdAt}, 'YYYY-MM')`;
    case "user":
      return Usage.userID;
    case "model":
      return Usage.modelID;
    case "type":
      return sql`COALESCE(${Usage.type}, 'unknown')`;
    default:
      return sql`to_char(date_trunc('day', ${Usage.createdAt}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
  }
}

function buildRequestKeySql() {
  return sql`COALESCE(${Usage.requestId}, CASE WHEN ${Usage.messageID} IS NOT NULL THEN CONCAT('message:', ${Usage.messageID}::text) ELSE CONCAT('usage:', ${Usage.id}::text) END)`;
}

function normalizeBalanceFields(data, existing = null) {
  const next = { ...data };
  const budget = hasOwn(next, "budget") ? next.budget : existing?.budget;
  const remainingProvided = hasOwn(next, "remaining");

  if (budget === null || budget === undefined) {
    if (!remainingProvided || next.remaining !== null) {
      next.remaining = null;
    }
    return next;
  }

  if (!remainingProvided || next.remaining === null) {
    next.remaining = budget;
  }

  return next;
}

function buildAccessMap(rolePolicies = []) {
  const access = {};

  for (const rolePolicy of rolePolicies) {
    const resource = rolePolicy?.Policy?.resource;
    const action = rolePolicy?.Policy?.action;

    if (!resource || !action) continue;

    access[resource] ||= {};
    access[resource][action] = true;
  }

  return access;
}

function serializeUserAccess(user) {
  if (!user) return null;

  const rolePolicies = user.Role?.RolePolicies || [];
  const access = buildAccessMap(rolePolicies);

  if (!user.Role?.RolePolicies) {
    return { ...user, access };
  }

  const { RolePolicies: _RolePolicies, ...role } = user.Role;

  return {
    ...user,
    Role: role,
    access,
  };
}

function userWithPolicies(where) {
  return db.query.User.findFirst({
    where,
    with: {
      Role: {
        with: {
          RolePolicies: {
            with: {
              Policy: true,
            },
          },
        },
      },
    },
  });
}

function roleWithPolicies(where) {
  return db.query.Role.findFirst({
    where,
    with: {
      RolePolicies: {
        with: {
          Policy: true,
        },
      },
    },
  });
}

export class UserService {
  // ===== Identity =====

  async getUser(id) {
    return serializeUserAccess(await userWithPolicies(eq(User.id, +id)));
  }

  async getUserByEmail(email) {
    return serializeUserAccess(await userWithPolicies(eq(User.email, email)));
  }

  async getUserByApiKey(apiKey) {
    return serializeUserAccess(await userWithPolicies(eq(User.apiKey, apiKey)));
  }

  async getAccessForRole(roleIdentifier) {
    const roleName = String(roleIdentifier);
    const where =
      typeof roleIdentifier === "number" || /^\d+$/.test(roleName)
        ? eq(Role.id, +roleIdentifier)
        : eq(Role.name, roleName);

    const role = await roleWithPolicies(where);
    return buildAccessMap(role?.RolePolicies || []);
  }

  async findOrCreateUser({ email, firstName, lastName }) {
    const [existing] = await db.select().from(User).where(eq(User.email, email)).limit(1);
    if (existing) return existing;

    const [{ value: userCount }] = await db.select({ value: count() }).from(User);
    const isFirstUser = userCount === 0;
    const defaults = isFirstUser ? { roleID: 1 } : { roleID: 3, budget: 1, remaining: 1 };

    const [user] = await db
      .insert(User)
      .values({ email, firstName, lastName, status: "active", ...defaults })
      .returning();
    return user;
  }

  // ===== CRUD =====

  async getUsers({
    search,
    limit = 100,
    offset = 0,
    sortBy = "createdAt",
    sortOrder = "DESC",
    ...filters
  } = {}) {
    const conditions = [];
    const searchCond = buildSearchConditions(search);
    if (searchCond) conditions.push(searchCond);

    for (const [key, value] of Object.entries(filters)) {
      if (User[key]) conditions.push(eq(User[key], value));
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

    const where = conditions.length ? and(...conditions) : undefined;
    const [{ value: total }] = await db.select({ value: count() }).from(User).where(where);

    const users = await db.query.User.findMany({
      where,
      with: { Role: true },
      limit,
      offset,
      orderBy: orderFn(orderCol),
    });

    return {
      data: users,
      meta: { total, limit, offset, search, sortBy, sortOrder },
    };
  }

  async createUser(data) {
    const allowedKeys = [
      "email",
      "firstName",
      "lastName",
      "status",
      "roleID",
      "apiKey",
      "budget",
      "remaining",
    ];
    const userData = Object.fromEntries(
      allowedKeys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]])
    );

    if (data.generateApiKey) {
      userData.apiKey = `rsk_${randomBytes(24).toString("base64url")}`;
    }

    const normalizedUserData = normalizeBalanceFields(userData);
    const [user] = await db.insert(User).values(normalizedUserData).returning();
    return user;
  }

  async updateUser(id, data) {
    const allowedKeys = [
      "email",
      "firstName",
      "lastName",
      "status",
      "roleID",
      "apiKey",
      "budget",
      "remaining",
    ];
    const userData = Object.fromEntries(
      allowedKeys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]])
    );

    if (data.generateApiKey) {
      userData.apiKey = `rsk_${randomBytes(24).toString("base64url")}`;
    }

    const [existing] = await db.select().from(User).where(eq(User.id, +id)).limit(1);
    if (!existing) return null;

    const normalizedUserData = normalizeBalanceFields(userData, existing);
    const [user] = await db
      .update(User)
      .set(normalizedUserData)
      .where(eq(User.id, +id))
      .returning();
    return user;
  }

  async deleteUser(id) {
    const [existing] = await db.select().from(User).where(eq(User.id, +id)).limit(1);
    if (!existing) return null;
    await db.delete(User).where(eq(User.id, +id));
    return { success: true };
  }

  async updateProfile(id, { firstName, lastName }) {
    const allowedFields = {};
    if (firstName !== undefined) allowedFields.firstName = firstName;
    if (lastName !== undefined) allowedFields.lastName = lastName;

    const [existing] = await db.select().from(User).where(eq(User.id, +id)).limit(1);
    if (!existing) return null;

    await db.update(User).set(allowedFields).where(eq(User.id, +id));
    return db.query.User.findFirst({
      where: eq(User.id, +id),
      with: { Role: true },
    });
  }

  // ===== Roles =====

  async getRoles() {
    return db.select().from(Role).orderBy(asc(Role.displayOrder));
  }

  // ===== Usage =====

  async recordUsage(userId, rows) {
    if (!rows?.length) return [];

    const inserted = await db.insert(Usage).values(rows).returning();

    const totalCost = rows.reduce((sum, r) => sum + (r.type === "guardrail" ? 0 : r.cost || 0), 0);
    if (totalCost > 0) {
      await db
        .update(User)
        .set({
          remaining: sql`GREATEST(0, COALESCE(${User.remaining}, ${User.budget}, 0) - ${totalCost})`,
        })
        .where(and(eq(User.id, userId), isNotNull(User.budget)));
    }

    return inserted;
  }

  async getUserUsage(
    userId,
    { startDate: startDateParam, endDate: endDateParam, type, limit = 100, offset = 0 } = {}
  ) {
    const [user] = await db.select().from(User).where(eq(User.id, +userId)).limit(1);
    if (!user) return null;

    const { startDate, endDate } = getDateRange(startDateParam, endDateParam);

    const conditions = [eq(Usage.userID, +userId), between(Usage.createdAt, startDate, endDate)];
    if (type) conditions.push(eq(Usage.type, type));
    const where = and(...conditions);

    const [{ value: total }] = await db.select({ value: count() }).from(Usage).where(where);

    const rows = await db.query.Usage.findMany({
      where,
      with: { Model: { columns: { id: true, name: true } } },
      orderBy: desc(Usage.createdAt),
      limit,
      offset,
    });

    return {
      data: rows.map((usage) => ({
        id: usage.id,
        requestId: usage.requestId,
        type: usage.type,
        userID: usage.userID,
        modelID: usage.modelID,
        modelName: usage.Model?.name,
        quantity: usage.quantity,
        unit: usage.unit,
        unitCost: usage.unitCost,
        cost: usage.cost,
        createdAt: serializeUtcTimestamp(usage.createdAt),
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
    };
  }

  async getUsage({
    startDate: startDateParam,
    endDate: endDateParam,
    userId,
    type,
    limit = 100,
    offset = 0,
  } = {}) {
    const { startDate, endDate } = getDateRange(startDateParam, endDateParam);

    const conditions = [between(Usage.createdAt, startDate, endDate)];
    if (userId) conditions.push(eq(Usage.userID, +userId));
    if (type) conditions.push(eq(Usage.type, type));
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

    return {
      data: rows.map((usage) => ({
        id: usage.id,
        requestId: usage.requestId,
        type: usage.type,
        userID: usage.userID,
        modelID: usage.modelID,
        modelName: usage.Model?.name,
        quantity: usage.quantity,
        unit: usage.unit,
        unitCost: usage.unitCost,
        cost: usage.cost,
        createdAt: serializeUtcTimestamp(usage.createdAt),
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
    };
  }

  async getAnalytics({
    startDate: startDateParam,
    endDate: endDateParam,
    groupBy = "day",
    userId,
    search,
    limit = 100,
    offset = 0,
    sortBy = "totalCost",
    sortOrder = "desc",
    role: roleFilter,
    status: statusFilter,
    type,
  } = {}) {
    const { startDate, endDate } = getDateRange(startDateParam, endDateParam);
    const groupCol = getGroupColumn(groupBy);
    const requestKey = buildRequestKeySql();
    const guardrailCostSum = sql`SUM(CASE WHEN ${Usage.type} = 'guardrail' THEN ${Usage.cost} ELSE 0 END)`;
    const usageCostSum = sql`SUM(CASE WHEN ${Usage.type} = 'guardrail' THEN 0 ELSE ${Usage.cost} END)`;

    const baseConditions = [between(Usage.createdAt, startDate, endDate)];
    if (userId) baseConditions.push(eq(Usage.userID, +userId));
    if (type) baseConditions.push(eq(Usage.type, type));

    if (groupBy === "user") {
      const joinConditions = [...baseConditions];
      const searchCond = buildSearchConditions(search);
      if (searchCond) joinConditions.push(searchCond);
      if (statusFilter && statusFilter !== "All")
        joinConditions.push(eq(User.status, statusFilter));
      if (roleFilter && roleFilter !== "All") joinConditions.push(eq(Role.name, roleFilter));

      const where = and(...joinConditions);

      const [{ value: totalCount }] = await db
        .select({ value: countDistinct(Usage.userID) })
        .from(Usage)
        .innerJoin(User, eq(Usage.userID, User.id))
        .leftJoin(Role, eq(User.roleID, Role.id))
        .where(where);

      const inputTokenSum = sql`SUM(CASE WHEN ${Usage.unit} = 'input_tokens' THEN ${Usage.quantity} ELSE 0 END)`;
      const outputTokenSum = sql`SUM(CASE WHEN ${Usage.unit} = 'output_tokens' THEN ${Usage.quantity} ELSE 0 END)`;

      const aggregateSortMapping = {
        totalCost: sum(Usage.cost),
        usageCost: usageCostSum,
        guardrailCost: guardrailCostSum,
        totalRequests: countDistinct(requestKey),
        totalInputTokens: inputTokenSum,
        totalOutputTokens: outputTokenSum,
        estimatedCost: sum(Usage.cost),
        inputTokens: inputTokenSum,
        outputTokens: outputTokenSum,
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
          usageCost: usageCostSum,
          guardrailCost: guardrailCostSum,
          totalInputTokens: inputTokenSum,
          totalOutputTokens: outputTokenSum,
          totalRequests: countDistinct(requestKey),
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
        .leftJoin(Role, eq(User.roleID, Role.id))
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

      return {
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
      };
    }

    // Pragmatic cross-domain read: JOINs Usage with Model (gateway's table) — Model is stable reference data
    if (groupBy === "model") {
      const where = and(...baseConditions);

      const modelInputSum = sql`SUM(CASE WHEN ${Usage.unit} = 'input_tokens' THEN ${Usage.quantity} ELSE 0 END)`;
      const modelOutputSum = sql`SUM(CASE WHEN ${Usage.unit} = 'output_tokens' THEN ${Usage.quantity} ELSE 0 END)`;

      const data = await db
        .select({
          modelID: Usage.modelID,
          totalCost: sum(Usage.cost),
          usageCost: usageCostSum,
          guardrailCost: guardrailCostSum,
          totalInputTokens: modelInputSum,
          totalOutputTokens: modelOutputSum,
          totalRequests: countDistinct(requestKey),
          Model: { name: Model.name },
        })
        .from(Usage)
        .innerJoin(Model, eq(Usage.modelID, Model.id))
        .where(where)
        .groupBy(Usage.modelID, Model.id, Model.name)
        .orderBy(desc(sum(Usage.cost)));

      return { data, meta: { groupBy } };
    }

    if (groupBy === "type") {
      const where = and(...baseConditions);

      const data = await db
        .select({
          type: groupCol,
          totalCost: sum(Usage.cost),
          totalRequests: countDistinct(requestKey),
          uniqueUsers: countDistinct(Usage.userID),
        })
        .from(Usage)
        .where(where)
        .groupBy(groupCol)
        .orderBy(desc(sum(Usage.cost)));

      return { data, meta: { groupBy, type } };
    }

    // Time-based grouping (hour, day, week, month)
    const where = and(...baseConditions);

    const timeInputSum = sql`SUM(CASE WHEN ${Usage.unit} = 'input_tokens' THEN ${Usage.quantity} ELSE 0 END)`;
    const timeOutputSum = sql`SUM(CASE WHEN ${Usage.unit} = 'output_tokens' THEN ${Usage.quantity} ELSE 0 END)`;

    const data = await db
      .select({
        period: groupCol,
        totalCost: sum(Usage.cost),
        usageCost: usageCostSum,
        guardrailCost: guardrailCostSum,
        totalInputTokens: timeInputSum,
        totalOutputTokens: timeOutputSum,
        totalRequests: countDistinct(requestKey),
        uniqueUsers: countDistinct(Usage.userID),
      })
      .from(Usage)
      .where(where)
      .groupBy(groupCol)
      .orderBy(desc(groupCol));

    return { data, meta: { groupBy } };
  }

  // ===== Budget =====

  async resetAllBudgets() {
    return db
      .update(User)
      .set({ remaining: sql`${User.budget}` })
      .where(isNotNull(User.budget));
  }

  async resetUserBudget(userId) {
    const [user] = await db.select().from(User).where(eq(User.id, +userId)).limit(1);
    if (!user) return null;

    const result = await db
      .update(User)
      .set({ remaining: sql`${User.budget}` })
      .where(eq(User.id, +userId))
      .returning();

    return result[0] || null;
  }

  // ===== Environment-based Config =====

  /**
   * @param {string} toolName
   * @returns {Promise<boolean>} `true` if enabled (not in disabled list), `false` if disabled.
   */
  async isToolEnabled(toolName) {
    const [row] = await db
      .select({ value: Configuration.value })
      .from(Configuration)
      .where(eq(Configuration.key, DISABLED_TOOLS_CONFIG_KEY))
      .limit(1);

    return isToolEnabledFromDisabledValue(toolName, row?.value);
  }

  // ===== Config =====
  getConfig() {
    const { label: budgetLabel, resetDescription: budgetResetDescription } =
      describeCron(USAGE_RESET_SCHEDULE);

    return {
      budgetLabel,
      budgetResetDescription,
    };
  }
}
