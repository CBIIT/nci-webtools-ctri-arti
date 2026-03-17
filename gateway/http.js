import { json, Router } from "express";
import logger from "shared/logger.js";
import { logErrors, logRequests } from "shared/middleware.js";
import { resolveRequestId } from "shared/request-context.js";

function sendGatewayError(res, error) {
  return res.status(error.statusCode).json({
    error: error.message,
    ...(error.code ? { code: error.code } : {}),
  });
}

export function createGatewayRouter({ application } = {}) {
  if (!application) {
    throw new Error("gateway application is required");
  }

  const api = Router();

  api.use(json({ limit: 1024 ** 3 })); // 1GB
  api.use(logRequests());

  api.post("/v1/model/invoke", async (req, res, next) => {
    try {
      const result = await application.invoke({
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
        } catch (error) {
          logger.error("Error processing stream message:", error);
        }
      }
      res.end();
    } catch (error) {
      if (error.statusCode) {
        return sendGatewayError(res, error);
      }
      logger.error("Error in gateway invoke:", error);
      next(error);
    }
  });

  api.get("/v1/models", async (req, res, next) => {
    try {
      const results = await application.listModels({ type: req.query.type });
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  api.get("/v1/guardrails", async (_req, res, next) => {
    try {
      const results = await application.listGuardrails();
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  api.post("/v1/guardrails/reconcile", async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
      const results = await application.reconcileGuardrails({ ids });
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  api.delete("/v1/guardrails/:id", async (req, res, next) => {
    try {
      const result = await application.deleteGuardrail(Number(req.params.id));
      res.json(result);
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      next(error);
    }
  });

  api.post("/v1/usage", async (req, res, next) => {
    try {
      const result = await application.trackUsage(
        req.body?.userID,
        req.body?.model,
        req.body?.usageItems,
        req.body?.options
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  api.post("/v1/model-usage", async (req, res, next) => {
    try {
      const result = await application.trackModelUsage(
        req.body?.userID,
        req.body?.model,
        req.body?.ip,
        req.body?.usageData,
        req.body?.options
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  api.use(logErrors());

  return api;
}
