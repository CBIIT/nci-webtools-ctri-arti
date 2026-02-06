import { json, Router } from "express";
import { logErrors, logRequests } from "../middleware.js";
import { Model, Usage, User } from "../database.js";
import { runModel } from "./inference.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());

/**
 * POST /api/infer - Main inference endpoint for AI model requests
 * Internal service endpoint - expects userId to be passed in the request body
 */
api.post("/infer", async (req, res, next) => {
  const { userId, model, messages, system, tools, thoughtBudget, stream, ip } = req.body;

  try {
    // Rate limit check
    if (userId) {
      const user = await User.findByPk(userId);
      if (user?.limit !== null && user?.remaining !== null && user?.remaining <= 0) {
        return res.status(429).json({
          error:
            "You have reached your allocated weekly usage limit. Your access to the chat tool is temporarily disabled and will reset on Monday at 12:00 AM. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.",
        });
      }
    }

    // Run inference
    const results = await runModel({ model, messages, system, tools, thoughtBudget, stream });

    // For non-streaming responses
    if (!results?.stream) {
      if (userId) {
        await trackModelUsage(userId, model, ip, results.usage);
      }
      return res.json(results);
    }

    // Streaming response
    for await (const message of results.stream) {
      try {
        if (message.metadata && userId) {
          await trackModelUsage(userId, model, ip, message.metadata.usage);
        }
        res.write(JSON.stringify(message) + "\n");
      } catch (err) {
        console.error("Error processing stream message:", err);
      }
    }
    res.end();
  } catch (error) {
    console.error("Error in gateway infer:", error);
    next(error);
  }
});

/**
 * Track model usage and update user's remaining balance
 */
async function trackModelUsage(userId, modelValue, ip, usageData) {
  try {
    if (!userId || !usageData || !modelValue) return;

    const model = await Model.findOne({ where: { internalName: modelValue } });
    if (!model) return;

    const inputTokens = Math.max(0, parseInt(usageData.inputTokens) || 0);
    const outputTokens = Math.max(0, parseInt(usageData.outputTokens) || 0);
    const cacheReadTokens = Math.max(0, parseInt(usageData.cacheReadInputTokens) || 0);
    const cacheWriteTokens = Math.max(0, parseInt(usageData.cacheWriteInputTokens) || 0);

    const inputCost = (inputTokens / 1000) * (model.cost1kInput || 0);
    const outputCost = (outputTokens / 1000) * (model.cost1kOutput || 0);
    const cacheReadCost = (cacheReadTokens / 1000) * (model.cost1kCacheRead || 0);
    const cacheWriteCost = (cacheWriteTokens / 1000) * (model.cost1kCacheWrite || 0);
    const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

    const usageRecord = await Usage.create({
      userId,
      modelId: model.id,
      ip,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cost: totalCost,
    });

    if (totalCost > 0) {
      const user = await User.findByPk(userId);
      if (user && user.remaining !== null && user.limit !== null) {
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

/**
 * GET /api/models - List available models
 */
api.get("/models", async (req, res) => {
  const results = await Model.findAll({
    attributes: ["name", "internalName", "maxContext", "maxOutput", "maxReasoning"],
    where: { providerId: 1 },
  });
  res.json(results);
});

api.use(logErrors());

export default api;
export { trackModelUsage };
