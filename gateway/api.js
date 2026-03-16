import db, { Model, User } from "database";

import { and, eq } from "drizzle-orm";
import { json, Router } from "express";
import { describeCron } from "shared/cron.js";
import logger from "shared/logger.js";
import { logErrors, logRequests } from "shared/middleware.js";

import { runModel, runEmbedding } from "./inference.js";
import { trackModelUsage, trackUsage } from "./usage.js";

const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());

/**
 * Handles embedding inference requests.
 */
async function handleEmbedding(res, { model, userID, type, content, purpose }) {
  const result = await runEmbedding({ model, content, purpose });

  if (userID && result.usage) {
    const usageItems = [];
    if (result.usage.inputTextTokenCount)
      usageItems.push({ quantity: result.usage.inputTextTokenCount, unit: "input_tokens" });
    if (result.usage.imageCount)
      usageItems.push({ quantity: result.usage.imageCount, unit: "images" });
    if (result.usage.videoSeconds)
      usageItems.push({ quantity: result.usage.videoSeconds, unit: "video_seconds" });
    if (result.usage.audioSeconds)
      usageItems.push({ quantity: result.usage.audioSeconds, unit: "audio_seconds" });
    await trackUsage(userID, model, usageItems, { type: type || "embedding" });
  }

  return res.json(result);
}

/**
 * Handles chat inference requests (streaming and non-streaming).
 */
async function handleChat(
  req,
  res,
  next,
  { model, userID, type, messages, system, tools, thoughtBudget, stream, ip, outputConfig }
) {
  const results = await runModel({
    model,
    messages,
    system,
    tools,
    thoughtBudget,
    stream,
    outputConfig,
  });

  if (!results?.stream) {
    if (userID) {
      await trackModelUsage(userID, model, ip, results.usage, { type });
    }
    return res.json(results);
  }

  for await (const message of results.stream) {
    try {
      if (message.metadata && userID) {
        await trackModelUsage(userID, model, ip, message.metadata.usage, { type });
      }
      res.write(JSON.stringify(message) + "\n");
    } catch (err) {
      logger.error("Error processing stream message:", err);
    }
  }
  res.end();
}

/**
 * POST /api/v1/model/invoke - Unified inference endpoint
 * Handles both chat and embedding model types.
 */
api.post("/v1/model/invoke", async (req, res, next) => {
  const { userID, model, type } = req.body;

  try {
    // Resolve model from DB to check type
    const [modelRecord] = model
      ? await db.select().from(Model).where(eq(Model.internalName, model)).limit(1)
      : [null];
    if (!modelRecord) {
      return res.status(404).json({ error: "Model not found", code: "GATEWAY_MODEL_NOT_FOUND" });
    }

    // Rate limit check (applies to both chat and embedding requests)
    if (userID) {
      const [user] = await db.select().from(User).where(eq(User.id, userID)).limit(1);
      if (user?.budget !== null && user?.remaining !== null && user?.remaining <= 0) {
        const { resetDescription } = describeCron(USAGE_RESET_SCHEDULE);
        return res.status(429).json({
          error: `You have reached your allocated usage limit. Your access to the chat tool is temporarily disabled and will reset ${resetDescription}. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.`,
          code: "GATEWAY_RATE_LIMITED",
        });
      }
    }

    if (modelRecord.type === "embedding") {
      const { content, purpose } = req.body;
      return handleEmbedding(res, { model, userID, type, content, purpose });
    }

    return handleChat(req, res, next, { ...req.body });
  } catch (error) {
    logger.error("Error in gateway invoke:", error);
    next(error);
  }
});

/**
 * GET /api/v1/models - List available models with optional type filter
 */
api.get("/v1/models", async (req, res) => {
  const where = [eq(Model.providerID, 1)];
  if (req.query.type) where.push(eq(Model.type, req.query.type));

  const results = await db
    .select({
      name: Model.name,
      internalName: Model.internalName,
      type: Model.type,
      maxContext: Model.maxContext,
      maxOutput: Model.maxOutput,
      maxReasoning: Model.maxReasoning,
    })
    .from(Model)
    .where(and(...where));
  res.json(results);
});

api.use(logErrors());

export default api;
export { trackModelUsage, trackUsage };
