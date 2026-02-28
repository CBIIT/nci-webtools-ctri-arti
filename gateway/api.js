import db, { Model, User } from "database";

import { eq } from "drizzle-orm";
import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";

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
  const { userID, model, messages, system, tools, thoughtBudget, stream, ip, outputConfig } =
    req.body;

  try {
    // Resolve model from DB to check type
    const [modelRecord] = model
      ? await db.select().from(Model).where(eq(Model.internalName, model)).limit(1)
      : [null];
    if (!modelRecord) {
      return res.status(404).json({ error: "Model not found", code: "GATEWAY_MODEL_NOT_FOUND" });
    }

    // Embedding models are stubbed for now
    if (modelRecord.type === "embedding") {
      return res
        .status(501)
        .json({ error: "Embedding not yet implemented", code: "GATEWAY_NOT_IMPLEMENTED" });
    }

    // Rate limit check
    if (userID) {
      const [user] = await db.select().from(User).where(eq(User.id, userID)).limit(1);
      if (user?.budget !== null && user?.remaining !== null && user?.remaining <= 0) {
        return res.status(429).json({
          error:
            "You have reached your allocated weekly usage limit. Your access to the chat tool is temporarily disabled and will reset on Monday at 12:00 AM. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.",
          code: "GATEWAY_RATE_LIMITED",
        });
      }
    }

    // Run inference
    const results = await runModel({
      model,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      outputConfig,
    });

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
  const where = [eq(Model.providerID, 1)];
  if (req.query.type) where.push(eq(Model.type, req.query.type));

  const { and } = await import("drizzle-orm");
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
export { trackModelUsage };
