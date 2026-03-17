import { Router } from "express";

import { chat } from "../../agents.js";
import { requireRole } from "../../auth.js";
import { getRequestContext } from "../utils.js";

const api = Router();

api.post("/agents/:agentId/conversations/:conversationId/chat", requireRole(), async (req, res) => {
  const context = getRequestContext(req);
  const { agentId, conversationId } = req.params;
  const { message, modelOverride, thoughtBudget } = req.body;

  if (!message?.content) {
    return res.status(400).json({ error: "Message content required" });
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");

  try {
    const stream = chat({
      context,
      agentId: Number(agentId),
      conversationId: Number(conversationId),
      message,
      modelOverride,
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
      // Response may already be closed.
    }
  }

  res.end();
});

export default api;
