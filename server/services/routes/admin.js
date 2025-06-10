import { Router } from "express";
import { Op, fn, col } from "sequelize";
import { requireRole } from "../middleware.js";
import { User, Model, Role, Usage, Provider } from "../database.js";

const api = Router();

// Admin routes - User Management
api.get("/admin/users", requireRole("admin"), async (req, res) => {
  const users = await User.findAll({
    where: req.query,
    include: [{ model: Role }],
  });
  res.json(users);
});

api.get("/admin/users/:id", requireRole("admin"), async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    include: [
      { model: Role },
      // Include recent usage data for the user
      {
        model: Usage,
        limit: 20,
        order: [["createdAt", "DESC"]],
        include: [{ model: Model }],
      },
    ],
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
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

// Get usage statistics for a specific user (admin only)
api.get("/admin/users/:id/usage", requireRole("admin"), async (req, res) => {
  const userId = req.params.id;
  const user = await User.findByPk(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Get the date range from query parameters or use default (last 30 days)
  const now = new Date();
  let startDate, endDate;

  if (req.query.startDate) {
    // Parse the start date and set time to 00:00:00
    startDate = new Date(req.query.startDate);
    startDate.setHours(0, 0, 0, 0);
  } else {
    // Default to 30 days ago at 00:00:00
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
  }

  if (req.query.endDate) {
    // Parse the end date and set time to 23:59:59.999
    endDate = new Date(req.query.endDate);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Default to today at 23:59:59.999
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
  }

  console.log(`Date range for usage statistics: ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // Query usage data for the specific user
  const usageData = await Usage.findAll({
    where: {
      userId: userId,
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
    },
    include: [{ model: Model }],
    order: [["createdAt", "DESC"]],
  });

  // Calculate aggregate statistics
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;
  const usageByModel = {};
  const dailyUsage = {};

  usageData.forEach((entry) => {
    // Increment total counters
    totalInputTokens += entry.inputTokens || 0;
    totalOutputTokens += entry.outputTokens || 0;
    totalCost += entry.cost || 0;

    // Group by model
    const modelName = entry.Model?.label || "Unknown";
    if (!usageByModel[modelName]) {
      usageByModel[modelName] = {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        count: 0,
      };
    }
    usageByModel[modelName].inputTokens += entry.inputTokens || 0;
    usageByModel[modelName].outputTokens += entry.outputTokens || 0;
    usageByModel[modelName].cost += entry.cost || 0;
    usageByModel[modelName].count += 1;

    // Group by date (daily)
    const dateKey = entry.createdAt.toISOString().split("T")[0];
    if (!dailyUsage[dateKey]) {
      dailyUsage[dateKey] = {
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        count: 0,
      };
    }
    dailyUsage[dateKey].inputTokens += entry.inputTokens || 0;
    dailyUsage[dateKey].outputTokens += entry.outputTokens || 0;
    dailyUsage[dateKey].cost += entry.cost || 0;
    dailyUsage[dateKey].count += 1;
  });

  // Convert the dailyUsage object to an array sorted by date
  const dailyUsageArray = Object.entries(dailyUsage)
    .map(([date, stats]) => ({
      date,
      ...stats,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Return the statistics
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      limit: user.limit,
      remaining: user.remaining,
    },
    summary: {
      totalRequests: usageData.length,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      dateRange: {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      },
    },
    usageByModel,
    dailyUsage: dailyUsageArray,
    rawData: usageData,
  });
});

// Get all roles (admin only)
api.get("/admin/roles", requireRole("admin"), async (req, res) => {
  const roles = await Role.findAll({ order: [["order"]], });// Order by the 'order' field 
  res.json(roles);
});

// Get usage statistics for all users (admin only)
api.get("/admin/usage", requireRole("admin"), async (req, res) => {
  try {
    // Get the date range from query parameters
    const now = new Date();
    let startDate, endDate;
    const dateRange = req.query.dateRange || "This Week";
    
    // Calculate start date based on dateRange parameter
    switch(dateRange) {
      case "This Week": {
        // Start from the most recent Sunday at midnight
        startDate = new Date(now);
        const day = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const diff = day; // Days since last Sunday
        startDate.setDate(startDate.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case "Last 30 Days": {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case "Last 60 Days": {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 60);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case "Last 120 Days": {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 120);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      case "Last 360 Days": {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 360);
        startDate.setHours(0, 0, 0, 0);
        break;
      }
      default: { // Default to This Week
        startDate = new Date(now);
        const day = startDate.getDay();
        const diff = day;
        startDate.setDate(startDate.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
      }
    }
    
    // End date is now
    endDate = new Date(now);
    
    // Get all users with their roles
    const users = await User.findAll({
      include: [{ model: Role }]
    });
    
    // Get all usage data within the date range
    const usageData = await Usage.findAll({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      include: [
        { model: Model },
        { model: User, include: [{ model: Role }] }
      ],
    });
    
    // Get all models for reference
    const models = await Model.findAll({
      include: [{ model: Provider }]
    });
    
    // Process the data to create user summaries
    const userSummaries = users.map(user => {
      // Filter usage for this specific user
      const userUsage = usageData.filter(entry => entry.userId === user.id);
      
      // Group usage by model
      const usageByModel = {};
      let totalCost = 0;
      
      userUsage.forEach(entry => {
        const modelId = entry.modelId;
        const model = models.find(m => m.id === modelId);
        const modelName = model?.label || "Unknown";
        
        if (!usageByModel[modelName]) {
          usageByModel[modelName] = {
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
          };
        }
        
        usageByModel[modelName].inputTokens += entry.inputTokens || 0;
        usageByModel[modelName].outputTokens += entry.outputTokens || 0;
        usageByModel[modelName].cost += entry.cost || 0;
        totalCost += entry.cost || 0;
      });
      
      // Calculate input and output tokens for display
      const inputTokens = Object.values(usageByModel)
        .map(m => Math.round(m.inputTokens))
        .join("/");
      
      const outputTokens = Object.values(usageByModel)
        .map(m => Math.round(m.outputTokens))
        .join("/");
      
      // Format the weekly cost limit
      const weeklyCostLimit = user.roleId === 1 ? "No limit" : user.limit || 0;
      
      return {
        id: user.id,
        name: `${user.lastName || ''}, ${user.firstName || ''}`.trim(),
        email: user.email,
        role: user.Role?.name || "Unknown",
        roleId: user.roleId,
        inputTokens: inputTokens || "0",
        outputTokens: outputTokens || "0",
        weeklyCostLimit,
        estimatedCost: parseFloat(totalCost.toFixed(2))
      };
    });
    
    res.json({
      dateRange,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      users: userSummaries
    });
  } catch (error) {
    console.error("Error fetching users usage:", error);
    res.status(500).json({ error: "Failed to fetch users usage data" });
  }
});

export default api;
