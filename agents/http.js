import { json, Router } from "express";
import { JSON_BODY_LIMIT } from "shared/http-limits.js";
import logger from "shared/logger.js";
import { readHttpRequestContext } from "shared/request-context.js";
import { routeHandler, streamNdjsonResponse } from "shared/utils.js";

import { validateUserMessageContent } from "./validation.js";

export function getAgentRequestContext(req) {
  return readHttpRequestContext(req, {
    allowInternalHeader: true,
    source: "server",
  });
}

async function consumeBackground(stream) {
  try {
    for await (const _event of stream) {
      // Fire-and-forget for now.
    }
  } catch (error) {
    logger.error("Background agent loop error:", error);
  }
}

async function handleChatRequest(req, res, { application, resolveContext, conversationId = null }) {
  // Pre-stream validation — errors throw and are caught by routeHandler → next(error) → logErrors
  const context = resolveContext(req);
  const { agentId } = req.params;
  const { message, modelOverride, thoughtBudget, background } = req.body;

  if (!message?.content) {
    return res.status(400).json({ error: "Message content required" });
  }
  validateUserMessageContent(message.content);

  const stream = application.chat({
    context,
    agentId: Number(agentId),
    conversationId,
    message,
    modelOverride,
    thoughtBudget,
  });

  if (background) {
    void consumeBackground(stream);
    return res.status(202).json({ requestId: context.requestId, background: true });
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");

  // Mid-stream errors must be handled inline (can't change HTTP status after headers are sent)
  try {
    await streamNdjsonResponse(res, stream, { end: false });
  } catch (error) {
    if (!res.headersSent && error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    logger.error("Agent loop error:", error);
    try {
      res.write(JSON.stringify({ agentError: { message: error.message } }) + "\n");
    } catch {
      // Response may already be closed.
    }
  }

  res.end();
}

export function createAgentsChatRouter({
  application,
  resolveContext = getAgentRequestContext,
} = {}) {
  if (!application) {
    throw new Error("agents application is required");
  }

  const api = Router();
  api.use(json({ limit: JSON_BODY_LIMIT }));

  api.post(
    "/agents/:agentId/conversations/:conversationId/chat",
    routeHandler(async (req, res) =>
      handleChatRequest(req, res, {
        application,
        resolveContext,
        conversationId: Number(req.params.conversationId),
      })
    )
  );

  api.post(
    "/agents/:agentId/chat",
    routeHandler(async (req, res) =>
      handleChatRequest(req, res, {
        application,
        resolveContext,
        conversationId: null,
      })
    )
  );

  return api;
}

export const createAgentsRouter = createAgentsChatRouter;
