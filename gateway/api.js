import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";
import { Model, User } from "database";
import { runModel } from "./inference.js";
import { trackModelUsage } from "./usage.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());

/**
 * POST /api/v1/model/invoke - Unified inference endpoint
 * Handles both chat and embedding model types.
 */
api.post("/v1/model/invoke", async (req, res, next) => {
  const { userID, model, messages, system, tools, thoughtBudget, stream, ip, outputConfig } = req.body;

  try {
    // Resolve model from DB to check type
    const modelRecord = model ? await Model.findOne({ where: { internalName: model } }) : null;
    if (!modelRecord) {
      return res.status(404).json({ error: "Model not found", code: "GATEWAY_MODEL_NOT_FOUND" });
    }

    // Embedding models are stubbed for now
    if (modelRecord.type === "embedding") {
      return res.status(501).json({ error: "Embedding not yet implemented", code: "GATEWAY_NOT_IMPLEMENTED" });
    }

    // Rate limit check
    if (userID) {
      const user = await User.findByPk(userID);
      if (user?.budget !== null && user?.remaining !== null && user?.remaining <= 0) {
        return res.status(429).json({
          error: "You have reached your allocated weekly usage limit. Your access to the chat tool is temporarily disabled and will reset on Monday at 12:00 AM. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.",
          code: "GATEWAY_RATE_LIMITED",
        });
      }
    }

    // Run inference
    const results = await runModel({ model, messages, system, tools, thoughtBudget, stream, outputConfig });

    // For non-streaming responses
    if (!results?.stream) {
      if (userID) {
        await trackModelUsage(userID, model, ip, results.usage);
      }
      return res.json(results);
    }

    // Streaming response
    for await (const message of results.stream) {
      try {
        if (message.metadata && userID) {
          await trackModelUsage(userID, model, ip, message.metadata.usage);
        }
        res.write(JSON.stringify(message) + "\n");
      } catch (err) {
        console.error("Error processing stream message:", err);
      }
    }
    res.end();
  } catch (error) {
    console.error("Error in gateway invoke:", error);
    next(error);
  }
});

/**
 * GET /api/v1/models - List available models with optional type filter
 */
api.get("/v1/models", async (req, res) => {
  const where = { providerID: 1 };
  if (req.query.type) where.type = req.query.type;

  const results = await Model.findAll({
    attributes: ["name", "internalName", "type", "maxContext", "maxOutput", "maxReasoning"],
    where,
  });
  res.json(results);
});

// ===== LEGACY ROUTES (kept temporarily for transition) =====

/**
 * POST /api/infer - Legacy inference endpoint
 */
api.post("/infer", async (req, res, next) => {
  const { userId, userID, model, messages, system, tools, thoughtBudget, stream, ip } = req.body;
  const effectiveUserID = userID || userId;

  try {
    if (effectiveUserID) {
      const user = await User.findByPk(effectiveUserID);
      if (user?.budget !== null && user?.remaining !== null && user?.remaining <= 0) {
        return res.status(429).json({
          error: "You have reached your allocated weekly usage limit. Your access to the chat tool is temporarily disabled and will reset on Monday at 12:00 AM. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.",
        });
      }
    }

    const results = await runModel({ model, messages, system, tools, thoughtBudget, stream });

    if (!results?.stream) {
      if (effectiveUserID) {
        await trackModelUsage(effectiveUserID, model, ip, results.usage);
      }
      return res.json(results);
    }

    for await (const message of results.stream) {
      try {
        if (message.metadata && effectiveUserID) {
          await trackModelUsage(effectiveUserID, model, ip, message.metadata.usage);
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
 * GET /api/models - Legacy model listing
 */
api.get("/models", async (req, res) => {
  const results = await Model.findAll({
    attributes: ["name", "internalName", "maxContext", "maxOutput", "maxReasoning"],
    where: { providerID: 1 },
  });
  res.json(results);
});

api.use(logErrors());

export default api;
export { trackModelUsage };
