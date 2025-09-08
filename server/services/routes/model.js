import { json, Router } from "express";

import { Model, Usage, User } from "../database.js";
import { runModel } from "../inference.js";
import { requireRole } from "../middleware.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

api.post("/model", requireRole(), async (req, res) => {
  const user = req.session.user;
  const modelValue = req.body.model;
  const ip = req.ip || req.socket.remoteAddress;

  try {
    // Check if user has remaining balance before processing
    if (user && user.limit !== null && user.remaining !== null && user.remaining <= 0) {
      return res.status(429).json({
        error:
          "You have reached your allocated weekly usage limit. Your access to the chat tool is temporarily disabled and will reset on Monday at 12:00 AM. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.",
      });
    }

    // Run the model
    const results = await runModel(req.body);

    // For non-streaming responses with Bedrock/Claude
    if (!results?.stream) {
      await trackModelUsage(user.id, modelValue, ip, results.usage);
      return res.json(results);
    }

    for await (const message of results.stream) {
      try {
        if (message.metadata)
          await trackModelUsage(user.id, modelValue, ip, message.metadata.usage);
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

api.get("/model/list", requireRole(), async (req, res) => {
  const results = await Model.findAll({
    attributes: ["label", "value", "maxContext", "maxOutput", "maxReasoning"],
    where: { providerId: 1 },
  });
  res.json(results);
});

export default api;
