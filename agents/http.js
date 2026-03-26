import { json, Router } from "express";
import { readHttpRequestContext } from "shared/request-context.js";

import { validateUserMessageContent } from "./validation.js";

export function getAgentRequestContext(req) {
  return readHttpRequestContext(req, {
    allowInternalHeader: true,
    source: "server",
  });
}

async function streamEvents(res, stream) {
  for await (const event of stream) {
    res.write(JSON.stringify(event) + "\n");
  }
}

async function consumeBackground(stream) {
  try {
    for await (const _event of stream) {
      // Fire-and-forget for now.
    }
  } catch (error) {
    console.error("Background agent loop error:", error);
  }
}

async function handleChatRequest(req, res, { application, resolveContext, conversationId = null }) {
  let context;
  try {
    context = resolveContext(req);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }

  const { agentId } = req.params;
  const { message, modelOverride, thoughtBudget, background } = req.body;

  if (!message?.content) {
    return res.status(400).json({ error: "Message content required" });
  }
  try {
    validateUserMessageContent(message.content);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }

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

  try {
    await streamEvents(res, stream);
  } catch (error) {
    if (!res.headersSent && error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("Agent loop error:", error);
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
  api.use(json({ limit: 1024 ** 3 }));

  api.post("/agents/:agentId/conversations/:conversationId/chat", async (req, res) =>
    handleChatRequest(req, res, {
      application,
      resolveContext,
      conversationId: Number(req.params.conversationId),
    })
  );

  api.post("/agents/:agentId/chat", async (req, res) =>
    handleChatRequest(req, res, {
      application,
      resolveContext,
      conversationId: null,
    })
  );

  return api;
}

export const createAgentsRouter = createAgentsChatRouter;
