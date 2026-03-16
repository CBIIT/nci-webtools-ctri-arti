import { json, Router } from "express";
import logger from "shared/logger.js";
import { logErrors, logRequests } from "shared/middleware.js";

import { createGatewayApplication } from "./app.js";
import { runModel, runEmbedding } from "./inference.js";
import { trackModelUsage, trackUsage } from "./usage.js";

const app = createGatewayApplication({
  modelInvoker: runModel,
  embeddingInvoker: runEmbedding,
  modelUsageTracker: trackModelUsage,
  usageTracker: trackUsage,
});

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());

/**
 * POST /api/v1/model/invoke - Unified inference endpoint
 * Handles both chat and embedding model types.
 */
api.post("/v1/model/invoke", async (req, res, next) => {
  try {
    const result = await app.invoke(req.body);
    if (result?.status === 429) {
      return res.status(429).json({
        error: result.error,
        code: result.code || "GATEWAY_RATE_LIMITED",
      });
    }

    if (!result?.stream) {
      return res.json(result);
    }

    for await (const message of result.stream) {
      try {
        res.write(JSON.stringify(message) + "\n");
      } catch (err) {
        logger.error("Error processing stream message:", err);
      }
    }
    res.end();
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
    }
    logger.error("Error in gateway invoke:", error);
    next(error);
  }
});

/**
 * GET /api/v1/models - List available models with optional type filter
 */
api.get("/v1/models", async (req, res) => {
  const results = await app.listModels({ type: req.query.type });
  res.json(results);
});

api.use(logErrors());

export default api;
export { trackModelUsage, trackUsage };
