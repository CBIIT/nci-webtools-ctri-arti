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

function resolveGatewayInvokeInput(req) {
  return {
    ...req.body,
    requestId: resolveRequestId(req.body?.requestId, req.headers["x-request-id"]),
  };
}

function sendGatewayRateLimit(res, result, { includeCode = true } = {}) {
  return res.status(429).json({
    error: result.error,
    ...(includeCode ? { code: result.code || "GATEWAY_RATE_LIMITED" } : {}),
  });
}

function forwardGatewayError(error, next, { operation, createUnexpectedError } = {}) {
  if (error.statusCode) {
    return next(error);
  }

  logger.error(`Error in ${operation}:`, error);
  return next(createUnexpectedError ? createUnexpectedError(error, operation) : error);
}

async function streamGatewayResponse(res, stream) {
  for await (const message of stream) {
    try {
      res.write(JSON.stringify(message) + "\n");
    } catch (error) {
      logger.error("Error processing stream message:", error);
    }
  }
  res.end();
}

export function createGatewayModelRouter({
  application,
  invokePath = "/v1/model/invoke",
  listPath = "/v1/models",
  resolveInvokeInput = resolveGatewayInvokeInput,
  includeRateLimitCode = true,
  createUnexpectedError,
} = {}) {
  if (!application) {
    throw new Error("gateway application is required");
  }

  const api = Router();
  api.use(json({ limit: 1024 ** 3 })); // 1GB

  api.post(invokePath, async (req, res, next) => {
    try {
      const result = await application.invoke(resolveInvokeInput(req));

      if (result?.status === 429) {
        return sendGatewayRateLimit(res, result, { includeCode: includeRateLimitCode });
      }

      if (!result?.stream) {
        return res.json(result);
      }

      await streamGatewayResponse(res, result.stream);
    } catch (error) {
      if (error.statusCode) {
        return sendGatewayError(res, error);
      }

      return forwardGatewayError(error, next, {
        operation: "gateway invoke",
        createUnexpectedError,
      });
    }
  });

  api.get(listPath, async (req, res, next) => {
    try {
      const results = await application.listModels({ type: req.query.type });
      res.json(results);
    } catch (error) {
      return forwardGatewayError(error, next, {
        operation: "gateway list models",
        createUnexpectedError,
      });
    }
  });

  return api;
}

export function createGatewayRouter({ application } = {}) {
  if (!application) {
    throw new Error("gateway application is required");
  }

  const api = Router();

  api.use(logRequests());
  api.use(createGatewayModelRouter({ application }));

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
