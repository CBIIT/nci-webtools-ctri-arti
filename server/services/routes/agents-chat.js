import { Router } from "express";
import { agentsClient } from "shared/clients/agents.js";
import { requireRole } from "users/middleware.js";

const api = Router();

function getUserId(req) {
  const userId = req.session?.user?.id;
  if (!userId) {
    return null;
  }
  return userId;
}

/**
 * POST /agents/:agentId/conversations/:conversationId/chat
 *
 * Proxies to the agents service (or runs locally in monolith mode).
 * Streams NDJSON back to the client.
 */
api.post("/agents/:agentId/conversations/:conversationId/chat", requireRole(), async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const { agentId, conversationId } = req.params;
  const { message, model, thoughtBudget } = req.body;

  if (!message?.content) {
    return res.status(400).json({ error: "Message content required" });
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");

  try {
    const stream = agentsClient.chat({
      userId,
      agentId: Number(agentId),
      conversationId: Number(conversationId),
      message,
      model,
      thoughtBudget,
    });

    for await (const event of stream) {
      res.write(JSON.stringify(event) + "\n");
    }
  } catch (error) {
    console.error("Agent chat proxy error:", error);
    try {
      res.write(JSON.stringify({ agentError: { message: error.message } }) + "\n");
    } catch {
      // Response may already be closed
    }
  }

  res.end();
});

export default api;
