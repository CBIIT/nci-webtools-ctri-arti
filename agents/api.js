import { json, Router } from "express";
import { cmsClient } from "shared/clients/cms.js";
import { invoke } from "shared/clients/gateway.js";

import { runAgentLoop } from "./loop.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 }));

/**
 * POST /api/agents/:agentId/conversations/:conversationId/chat
 *
 * Runs the server-side agent loop, streaming NDJSON back to the client.
 * Each line is a JSON object: stream chunks, tool results, or agent errors.
 *
 * Body: { message: { content: [...] }, model?, thoughtBudget? }
 * Headers: X-User-Id (set by proxy or auth middleware)
 */
api.post("/api/agents/:agentId/conversations/:conversationId/chat", async (req, res) => {
  const userId = req.headers["x-user-id"] || req.session?.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "User ID required" });
  }

  const { agentId, conversationId } = req.params;
  const { message, model, thoughtBudget } = req.body;

  if (!message?.content) {
    return res.status(400).json({ error: "Message content required" });
  }

  const userMessage = { role: "user", content: message.content };

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");

  try {
    const loop = runAgentLoop({
      userId: Number(userId),
      agentId: Number(agentId),
      conversationId: Number(conversationId),
      userMessage,
      model,
      thoughtBudget: thoughtBudget || 0,
      gateway: { invoke },
      cms: cmsClient,
    });

    for await (const event of loop) {
      res.write(JSON.stringify(event) + "\n");
    }
  } catch (error) {
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

export default api;
