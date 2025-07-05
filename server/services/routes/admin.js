import { Router } from "express";
import { Op, fn, col, where as sequelizeWhere } from "sequelize";
import { requireRole } from "../middleware.js";
import { User, Model, Role, Usage, Provider } from "../database.js";
import { getDateRange } from "../utils.js";
import { resetUsageLimits } from "../scheduler.js";

const api = Router();

// Admin routes - User Management
api.get("/admin/users", requireRole("admin"), async (req, res) => {
  const search = req.query.search;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder || 'DESC';
  
  // Build search conditions
  const where = { ...req.query };
  delete where.search;
  delete where.limit;
  delete where.offset;
  delete where.sortBy;
  delete where.sortOrder;
  
  if (search) {
    // Use database-agnostic case-insensitive search
    const searchTerm = `%${search.toLowerCase()}%`;
    where[Op.or] = [
      sequelizeWhere(fn('LOWER', col('firstName')), Op.like, searchTerm),
      sequelizeWhere(fn('LOWER', col('lastName')), Op.like, searchTerm),
      sequelizeWhere(fn('LOWER', col('email')), Op.like, searchTerm)
    ];
  }

  // Map sortBy to actual columns/associations
  const sortMapping = {
    'name': ['lastName'],
    'lastName': ['lastName'],
    'firstName': ['firstName'], 
    'email': ['email'],
    'status': ['status'],
    'role': [{ model: Role }, 'name'],
    'limit': ['limit'],
    'createdAt': ['createdAt']
  };

  const orderBy = sortMapping[sortBy] || ['createdAt'];
  const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  const { count, rows: users } = await User.findAndCountAll({
    where,
    include: [{ model: Role }],
    limit,
    offset,
    order: [[...orderBy, orderDirection]]
  });
  
  res.json({ 
    data: users, 
    meta: { 
      total: count, 
      limit, 
      offset, 
      search,
      sortBy,
      sortOrder
    } 
  });
});

api.get("/admin/users/:id", requireRole("admin"), async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    include: [{ model: Role }],
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
});

// Update current user's profile (authenticated users only)
api.post("/admin/profile", requireRole(), async (req, res) => {
  const { session } = req;
  const currentUser = session.user;
  const { firstName, lastName } = req.body;

  // Only allow firstName and lastName updates
  const allowedFields = { firstName, lastName };
  
  // Remove undefined values
  Object.keys(allowedFields).forEach(key => {
    if (allowedFields[key] === undefined) {
      delete allowedFields[key];
    }
  });

  try {
    const user = await User.findByPk(currentUser.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await user.update(allowedFields);
    
    // Return updated user with Role included
    const updatedUser = await User.findByPk(currentUser.id, {
      include: [{ model: Role }]
    });
    
    res.json(updatedUser);
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Create or update a user (admin only)
api.post("/admin/users", requireRole("admin"), async (req, res) => {
  const { id, generateApiKey, ...userData } = req.body;

  // Generate API key if requested
  if (generateApiKey) {
    userData.apiKey = `rsk_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  }

  let user;
  if (id) {
    // Update existing user
    user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    await user.update(userData);
  } else {
    // Create new user
    user = await User.create(userData);
  }

  res.json(user);
});

// Delete a user (admin only)
api.delete("/admin/users/:id", requireRole("admin"), async (req, res) => {
  const user = await User.findByPk(req.params.id);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  await user.destroy();
  res.json({ success: true });
});

// Get usage data for a specific user (admin only)
api.get("/admin/users/:id/usage", requireRole("admin"), async (req, res) => {
  const userId = req.params.id;
  const user = await User.findByPk(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const { startDate, endDate } = getDateRange(req.query.startDate, req.query.endDate);
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  const { count, rows } = await Usage.findAndCountAll({
    where: {
      userId,
      createdAt: { [Op.between]: [startDate, endDate] }
    },
    include: [{ model: Model, attributes: ['id', 'label'] }],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  res.json({
    data: rows.map(usage => ({
      id: usage.id,
      userId: usage.userId,
      modelId: usage.modelId,
      modelName: usage.Model?.label,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost: usage.cost,
      createdAt: usage.createdAt
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
        limit: user.limit,
        remaining: user.remaining
      }
    }
  });
});

// Get all roles (admin only)
api.get("/admin/roles", requireRole("admin"), async (req, res) => {
  const roles = await Role.findAll({ order: [["order"]], });// Order by the 'order' field 
  res.json(roles);
});

// Get usage data for all users (admin only)
api.get("/admin/usage", requireRole("admin"), async (req, res) => {
  const { startDate, endDate } = getDateRange(req.query.startDate, req.query.endDate);
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const userId = req.query.userId;

  const where = {
    createdAt: { [Op.between]: [startDate, endDate] }
  };
  
  if (userId) {
    where.userId = userId;
  }

  const { count, rows } = await Usage.findAndCountAll({
    where,
    include: [
      { model: Model, attributes: ['id', 'label'] },
      { model: User, attributes: ['id', 'email', 'firstName', 'lastName', 'limit', 'remaining'], include: [{ model: Role, attributes: ['id', 'name'] }] }
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  res.json({
    data: rows.map(usage => ({
      id: usage.id,
      userId: usage.userId,
      modelId: usage.modelId,
      modelName: usage.Model?.label,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost: usage.cost,
      createdAt: usage.createdAt,
      user: {
        id: usage.User.id,
        email: usage.User.email,
        firstName: usage.User.firstName,
        lastName: usage.User.lastName,
        limit: usage.User.limit,
        remaining: usage.User.remaining,
        role: usage.User.Role?.name
      }
    })),
    meta: {
      total: count,
      limit,
      offset
    }
  });
});

// Reset usage limits for all users (admin only)
api.post("/admin/usage/reset", requireRole("admin"), async (req, res) => {
  const [updatedCount] = await resetUsageLimits();
  res.json({ success: true, updatedUsers: updatedCount });
});

// Reset usage limit for a specific user (admin only)
api.post("/admin/users/:id/reset-limit", requireRole("admin"), async (req, res) => {
  const userId = req.params.id;
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Reset the user's remaining balance to match their limit
    const [updated] = await User.update(
      { remaining: User.sequelize.col('limit') },
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
    res.status(500).json({ error: "An error occurred while resetting the user limit" });
  }
});

// Get usage analytics with aggregation (admin only)
api.get("/admin/analytics", requireRole("admin"), async (req, res) => {
  const { startDate, endDate } = getDateRange(req.query.startDate, req.query.endDate);
  const groupBy = req.query.groupBy || 'day';
  const userId = req.query.userId;
  const search = req.query.search;
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;
  const sortBy = req.query.sortBy || 'totalCost';
  const sortOrder = req.query.sortOrder || 'desc';
  const roleFilter = req.query.role;
  
  let dateFormat, groupCol;
  switch (groupBy) {
    case 'hour':
      dateFormat = '%Y-%m-%d %H:00:00';
      groupCol = fn('DATE_FORMAT', col('createdAt'), '%Y-%m-%d %H:00:00');
      break;
    case 'day':
      dateFormat = '%Y-%m-%d';
      groupCol = fn('DATE', col('createdAt'));
      break;
    case 'week':
      dateFormat = '%Y-%u';
      groupCol = fn('YEARWEEK', col('createdAt'));
      break;
    case 'month':
      dateFormat = '%Y-%m';
      groupCol = fn('DATE_FORMAT', col('createdAt'), '%Y-%m');
      break;
    case 'user':
      groupCol = col('userId');
      break;
    case 'model':
      groupCol = col('modelId');
      break;
    default:
      groupCol = fn('DATE', col('createdAt'));
  }

  const baseQuery = {
    where: { 
      createdAt: { [Op.between]: [startDate, endDate] },
      ...(userId && { userId })
    }
  };

  if (groupBy === 'user') {
    // Build search conditions for users
    const userWhere = {};
    if (search) {
      // Use database-agnostic case-insensitive search
      const searchTerm = `%${search.toLowerCase()}%`;
      userWhere[Op.or] = [
        sequelizeWhere(fn('LOWER', col('firstName')), Op.like, searchTerm),
        sequelizeWhere(fn('LOWER', col('lastName')), Op.like, searchTerm),
        sequelizeWhere(fn('LOWER', col('email')), Op.like, searchTerm)
      ];
    }

    // Add role filter
    const roleWhere = {};
    if (roleFilter && roleFilter !== 'All') {
      roleWhere.name = roleFilter;
    }

    // Map sortBy to actual columns
    const sortMapping = {
      'name': ['User', 'firstName'],
      'email': ['User', 'email'],
      'role': ['User->Role', 'name'],
      'totalCost': [fn('SUM', col('cost'))],
      'totalRequests': [fn('COUNT', col('*'))],
      'totalInputTokens': [fn('SUM', col('inputTokens'))],
      'totalOutputTokens': [fn('SUM', col('outputTokens'))],
      'estimatedCost': [fn('SUM', col('cost'))],
      'inputTokens': [fn('SUM', col('inputTokens'))],
      'outputTokens': [fn('SUM', col('outputTokens'))]
    };

    const orderBy = sortMapping[sortBy] || [fn('SUM', col('cost'))];
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count first for pagination
    const totalCount = await Usage.count({
      ...baseQuery,
      include: [{ 
        model: User, 
        where: userWhere,
        include: [{ model: Role, where: roleWhere }]
      }],
      distinct: true,
      col: 'userId'
    });

    const data = await Usage.findAll({
      ...baseQuery,
      attributes: [
        'userId',
        [fn('SUM', col('cost')), 'totalCost'],
        [fn('SUM', col('inputTokens')), 'totalInputTokens'],
        [fn('SUM', col('outputTokens')), 'totalOutputTokens'],
        [fn('COUNT', col('*')), 'totalRequests']
      ],
      include: [{ 
        model: User, 
        attributes: ['id', 'email', 'firstName', 'lastName', 'limit', 'remaining', 'roleId'],
        include: [{ model: Role, attributes: ['name'], where: roleWhere }],
        where: userWhere
      }],
      group: ['userId', 'User.id', 'User.email', 'User.firstName', 'User.lastName', 'User.limit', 'User.remaining', 'User.roleId', 'User->Role.id', 'User->Role.name'],
      order: [[...orderBy, orderDirection]],
      limit,
      offset
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
        total: totalCount 
      } 
    });
  }

  if (groupBy === 'model') {
    const data = await Usage.findAll({
      ...baseQuery,
      attributes: [
        'modelId',
        [fn('SUM', col('cost')), 'totalCost'],
        [fn('SUM', col('inputTokens')), 'totalInputTokens'],
        [fn('SUM', col('outputTokens')), 'totalOutputTokens'],
        [fn('COUNT', col('*')), 'totalRequests']
      ],
      include: [{ model: Model, attributes: ['label'] }],
      group: ['modelId', 'Model.id', 'Model.label'],
      order: [[fn('SUM', col('cost')), 'DESC']]
    });
    return res.json({ data, meta: { groupBy } });
  }

  // Time-based grouping
  const data = await Usage.findAll({
    ...baseQuery,
    attributes: [
      [groupCol, 'period'],
      [fn('SUM', col('cost')), 'totalCost'],
      [fn('SUM', col('inputTokens')), 'totalInputTokens'],
      [fn('SUM', col('outputTokens')), 'totalOutputTokens'],
      [fn('COUNT', col('*')), 'totalRequests'],
      [fn('COUNT', fn('DISTINCT', col('userId'))), 'uniqueUsers']
    ],
    group: [groupCol],
    order: [[groupCol, 'DESC']],
    raw: true
  });

  res.json({ data, meta: { groupBy } });
});

export default api;
