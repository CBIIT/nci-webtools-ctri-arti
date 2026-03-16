import { json, Router } from "express";
import { cmsClient } from "shared/clients/cms.js";
import { invoke, embed } from "shared/clients/gateway.js";
import {
  createRequestContext,
  parseInternalUserIdHeader,
  requireUserRequestContext,
} from "shared/request-context.js";

import { createAgentsApplication } from "./app.js";

const defaultApplication = createAgentsApplication({
  source: "internal-http",
  gateway: { invoke, embed },
  cms: cmsClient,
});

export function createAgentsRouter({ application = defaultApplication } = {}) {
  const api = Router();
  api.use(json({ limit: 1024 ** 3 }));

function getAgentRequestContext(req) {
  const headerContext = parseInternalUserIdHeader(req.headers["x-user-id"], {
    requestId: req.headers["x-request-id"],
  });
  if (headerContext) return requireUserRequestContext(headerContext);

  return requireUserRequestContext(
    createRequestContext(req.session?.user?.id, {
      source: "server",
      requestId: req.headers["x-request-id"],
    })
  );
}

/**
 * POST /api/agents/:agentId/conversations/:conversationId/chat
 *
 * Runs the server-side agent loop, streaming NDJSON back to the client.
 * Each line is a JSON object: stream chunks, tool results, or agent errors.
 *
 * Body: { message: { content: [...] }, modelOverride?, thoughtBudget? }
 * Headers: X-User-Id (set by proxy or auth middleware)
 */
  api.post("/api/agents/:agentId/conversations/:conversationId/chat", async (req, res) => {
    let context;
    try {
      context = getAgentRequestContext(req);
    } catch (error) {
      return res.status(error.statusCode || 400).json({ error: error.message });
    }

    const { agentId, conversationId } = req.params;
    const { message, modelOverride, thoughtBudget } = req.body;

    if (!message?.content) {
      return res.status(400).json({ error: "Message content required" });
    }

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");

    try {
      const loop = application.chat({
        context,
        agentId: Number(agentId),
        conversationId: Number(conversationId),
        message,
        modelOverride,
        thoughtBudget,
      });

      for await (const event of loop) {
        res.write(JSON.stringify(event) + "\n");
      }
    } catch (error) {
      if (!res.headersSent && error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error("Agent loop error:", error);
      // Try to send error if headers not yet flushed
      try {
        res.write(JSON.stringify({ agentError: { message: error.message } }) + "\n");
      } catch {
        // Response may already be closed
      }
    }

    res.end();
  });

  return api;
}

export default createAgentsRouter();
