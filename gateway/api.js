import { json, Router } from "express";
import logger from "shared/logger.js";
import { logErrors, logRequests } from "shared/middleware.js";
import { resolveRequestId } from "shared/request-context.js";

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
    const result = await app.invoke({
      ...req.body,
      requestId: resolveRequestId(req.body?.requestId, req.headers["x-request-id"]),
    });
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

api.get("/v1/guardrails", async (_req, res, next) => {
  try {
    const results = await app.listGuardrails();
    res.json(results);
  } catch (error) {
    next(error);
  }
});

api.post("/v1/guardrails/reconcile", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
    const results = await app.reconcileGuardrails({ ids });
    res.json(results);
  } catch (error) {
    next(error);
  }
});

api.delete("/v1/guardrails/:id", async (req, res, next) => {
  try {
    const result = await app.deleteGuardrail(Number(req.params.id));
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
});

api.use(logErrors());

export default api;
export { trackModelUsage, trackUsage };
