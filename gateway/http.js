import { json, Router } from "express";
import { JSON_BODY_LIMIT } from "shared/http-limits.js";
import logger from "shared/logger.js";
import { logErrors, logRequests } from "shared/middleware.js";
import { resolveRequestId } from "shared/request-context.js";
import { createAppError, routeHandler, streamNdjsonResponse } from "shared/utils.js";

function sendGatewayError(res, error) {
  return res.status(error.statusCode).json({
    error: error.message,
    ...(error.code ? { code: error.code } : {}),
  });
}

function resolveGatewayInvokeInput(req) {
  const body = req.body || {};
  const { userId: _userId, ...invokeBody } = body;
  return {
    ...invokeBody,
    userId: body.userId ?? null,
    requestId: resolveRequestId(invokeBody?.requestId, req.headers["x-request-id"]),
  };
}

function sendGatewayRateLimit(res, result) {
  return res.status(429).json({
    error: result.error,
    code: result.code || "GATEWAY_RATE_LIMITED",
  });
}

function createGatewayUnexpectedError(cause) {
  return createAppError(500, "An error occurred while processing the model request", { cause });
}

function forwardGatewayError(error, next) {
  if (error.statusCode) {
    return next(error);
  }

  logger.error("Error in gateway invoke:", error);
  return next(createGatewayUnexpectedError(error));
}

function streamGatewayResponse(res, stream) {
  return streamNdjsonResponse(res, stream, {
    onWriteError: (error) => logger.error("Error processing stream message:", error),
  });
}

/**
 * Wraps routeHandler to ensure unexpected errors (no statusCode) get a 500 status
 * with a safe user-facing message, rather than leaking internal details.
 */
function gatewayRouteHandler(fn) {
  return routeHandler(async (req, res, next) => {
    try {
      return await fn(req, res, next);
    } catch (error) {
      if (!error.statusCode) {
        throw createAppError(500, "An unexpected gateway error occurred", { cause: error });
      }
      throw error;
    }
  });
}

export function createGatewayModelRouter({
  application,
  resolveInvokeInput = resolveGatewayInvokeInput,
} = {}) {
  if (!application) {
    throw new Error("gateway application is required");
  }

  const api = Router();

  api.post("/model/invoke", async (req, res, next) => {
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

      return forwardGatewayError(error, next);
    }
  });

  api.get(
    "/model/list",
    gatewayRouteHandler(async (req, res) => {
      const results = await application.listModels({ type: req.query.type });
      res.json(results);
    })
  );

  return api;
}

export function createGatewayRouter({ application } = {}) {
  if (!application) {
    throw new Error("gateway application is required");
  }

  const api = Router();

  api.use(json({ limit: JSON_BODY_LIMIT }));
  api.use(logRequests());
  api.use(createGatewayModelRouter({ application }));

  api.get(
    "/guardrails",
    gatewayRouteHandler(async (_req, res) => {
      const results = await application.listGuardrails();
      res.json(results);
    })
  );

  api.post(
    "/guardrails/reconcile",
    gatewayRouteHandler(async (req, res) => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : undefined;
      const results = await application.reconcileGuardrails({ ids });
      res.json(results);
    })
  );

  api.delete(
    "/guardrails/:id",
    gatewayRouteHandler(async (req, res) => {
      const result = await application.deleteGuardrail(Number(req.params.id));
      res.json(result);
    })
  );

  api.post(
    "/usage",
    gatewayRouteHandler(async (req, res) => {
      const result = await application.trackUsage(
        req.body?.userId ?? null,
        req.body?.model,
        req.body?.usageItems,
        req.body?.options
      );
      res.json(result);
    })
  );

  api.post(
    "/model-usage",
    gatewayRouteHandler(async (req, res) => {
      const result = await application.trackModelUsage(
        req.body?.userId ?? null,
        req.body?.model,
        req.body?.usageData,
        req.body?.options
      );
      res.json(result);
    })
  );

  api.use(logErrors());

  return api;
}
