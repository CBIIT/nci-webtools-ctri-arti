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
  const { userId, userID, ...body } = req.body || {};
  return {
    ...body,
    userId: userId ?? userID ?? null,
    requestId: resolveRequestId(body?.requestId, req.headers["x-request-id"]),
  };
}

function sendGatewayRateLimit(res, result) {
  return res.status(429).json({
    error: result.error,
    code: result.code || "GATEWAY_RATE_LIMITED",
  });
}

function createGatewayUnexpectedError(operation, cause) {
  const message =
    operation === "gateway list models"
      ? "An error occurred while fetching models"
      : "An error occurred while processing the model request";
  const error = new Error(message);
  error.statusCode = 500;
  error.cause = cause;
  return error;
}

function forwardGatewayError(error, next, { operation } = {}) {
  if (error.statusCode) {
    return next(error);
  }

  logger.error(`Error in ${operation}:`, error);
  return next(createGatewayUnexpectedError(operation, error));
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
  invokePath = "/model/invoke",
  listPath = "/model/list",
  resolveInvokeInput = resolveGatewayInvokeInput,
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
        return sendGatewayRateLimit(res, result);
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

  api.get("/guardrails", async (_req, res, next) => {
    try {
      const results = await application.listGuardrails();
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  api.post("/guardrails/reconcile", async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
      const results = await application.reconcileGuardrails({ ids });
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  api.delete("/guardrails/:id", async (req, res, next) => {
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

  api.post("/usage", async (req, res, next) => {
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

  api.post("/model-usage", async (req, res, next) => {
    try {
      const result = await application.trackModelUsage(
        req.body?.userID,
        req.body?.model,
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
