import { json, Router } from "express";
import { readHttpRequestContext } from "shared/request-context.js";

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

export function createAgentsChatRouter({
  application,
  routePath = "/api/agents/:agentId/conversations/:conversationId/chat",
  resolveContext = getAgentRequestContext,
} = {}) {
  if (!application) {
    throw new Error("agents application is required");
  }

  const api = Router();
  api.use(json({ limit: 1024 ** 3 }));

  api.post(routePath, async (req, res) => {
    let context;
    try {
      context = resolveContext(req);
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
      const stream = application.chat({
        context,
        agentId: Number(agentId),
        conversationId: Number(conversationId),
        message,
        modelOverride,
        thoughtBudget,
      });

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
  });

  return api;
}

export const createAgentsRouter = createAgentsChatRouter;

