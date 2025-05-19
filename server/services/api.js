import { Router, json } from "express";
import { QueryTypes, Op } from "sequelize";
import { runModel } from "./inference.js";
import { authMiddleware, proxyMiddleware, logRequests, logErrors, loginMiddleware, requireRole } from "./middleware.js";
import { search } from "./utils.js";
import { translate, getLanguages } from "./translate.js";
import { sendFeedback } from "./email.js";
import db, { User, Model, Role, Usage, Provider } from "./database.js";

const { VERSION } = process.env;
const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());

api.get("/status", async (req, res) => {
  res.json({
    version: VERSION,
    uptime: process.uptime(),
    database: await db.query("SELECT 'ok' AS health", { plain: true, type: QueryTypes.SELECT }),
  });
});

api.get("/login", loginMiddleware, async (req, res) => {
  const { session } = req;
  const { email, first_name: firstName, last_name: lastName } = session.userinfo;
  if (!email) return res.redirect("/?error=missing_email");
  session.user = (await User.findOne({ where: { email } })) || (await User.create({ email, firstName, lastName, status: "pending" }));
  res.redirect(session.destination || "/");
});

api.get("/logout", (req, res) => {
  const destination = req.query.destination || "/";
  req.session.destroy(() => res.redirect(destination));
});

api.get("/session", async (req, res) => {
  const { session } = req;
  session.touch();
  session.expires = session.cookie.expires;

  let user = session.user;
  if (user) {
    user = await User.findByPk(user.id, { include: [{ model: Role }] });
  }

  res.json({
    user,
    expires: session.expires,
  });
});

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
  const roles = await Role.findAll();
  res.json(roles);
});

api.get("/search", authMiddleware, async (req, res) => {
  res.json(await search(req.query));
});

api.all("/browse/*url", authMiddleware, proxyMiddleware);

api.post("/translate", authMiddleware, async (req, res) => {
  res.json(await translate(req.body));
});

api.get("/translate/languages", authMiddleware, async (req, res) => {
  res.json(await getLanguages());
});

api.post("/model", authMiddleware, async (req, res) => {
  // Get the request start time
  const startTime = Date.now();

  // Store the model value from the request for usage tracking
  const modelValue = req.body.model;

  // Get user information from the session
  const userId = req.session?.user?.id;
  const ip = req.ip || req.socket.remoteAddress;

  try {
    // Run the model
    const results = await runModel(req.body);

    // For non-streaming responses with Bedrock/Claude
    if (!results?.stream) {
      await trackModelUsage(userId, modelValue, ip, results.usage);
      return res.json(results);
    }

    for await (const message of results.stream) {
      try {
        if (message.metadata) await trackModelUsage(userId, modelValue, ip, message.metadata.usage);
        res.write(JSON.stringify(message) + "\n");
      } catch (err) {
        console.error("Error processing stream message:", err);
      }
    }

    res.end();
  } catch (error) {
    console.error("Error in model API:", error);
    res.status(500).json({ error: "An error occurred while processing the model request" });
  }
});

async function trackModelUsage(userId, modelValue, ip, usageData) {
  try {
    // Skip if missing required data
    if (!userId || !usageData || !modelValue) return;

    // Get model info
    const model = await Model.findOne({ where: { value: modelValue } });
    if (!model) return;

    // Calculate token usage and cost
    const inputTokens = Math.max(0, parseInt(usageData.inputTokens) || 0);
    const outputTokens = Math.max(0, parseInt(usageData.outputTokens) || 0);
    const inputCost = (inputTokens / 1000) * (model.cost1kInput || 0);
    const outputCost = (outputTokens / 1000) * (model.cost1kOutput || 0);
    const totalCost = inputCost + outputCost;

    // Record usage in database
    const usageRecord = await Usage.create({
      userId,
      modelId: model.id,
      ip,
      inputTokens,
      outputTokens,
      cost: totalCost,
    });

    // Update user's remaining balance if needed
    if (totalCost > 0) {
      const user = await User.findByPk(userId);
      if (user && user.remaining !== null) {
        await user.update({
          remaining: Math.max(0, (user.remaining || 0) - totalCost),
        });
      }
    }

    return usageRecord;
  } catch (error) {
    console.error("Error tracking model usage:", error);
  }
}

api.get("/model/list", authMiddleware, async (req, res) => {
  const results = await Model.findAll({
    attributes: ["label", "value", "isReasoner", "maxContext", "maxOutput", "maxReasoning"],
    where: { providerId: 1 },
  });
  res.json(results);
});

api.post("/feedback", authMiddleware, async (req, res) => {
  const { feedback, context } = req.body;
  const from = req.session.user?.userinfo?.email;
  const results = await sendFeedback({ from, feedback, context });
  return res.json(results);
});

api.use(logErrors());

export default api;
