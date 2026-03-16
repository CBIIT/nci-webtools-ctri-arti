import { json, Router } from "express";
import { runModel } from "gateway/inference.js";
import { trackModelUsage } from "gateway/usage.js";
import { logErrors, logRequests } from "shared/middleware.js";
import { parseInternalUserIdHeader } from "shared/request-context.js";
import { routeHandler } from "shared/utils.js";

import { createCmsApplication } from "./app.js";
import { ConversationService } from "./conversation.js";

async function invokeModel({
  userID,
  model,
  messages,
  system,
  thoughtBudget,
  stream,
  type,
  requestId,
}) {
  const result = await runModel({ model, messages, system, thoughtBudget, stream });
  if (!result?.stream) {
    if (userID) {
      await trackModelUsage(userID, model, null, result.usage, {
        type,
        requestId,
        trace: result.trace,
      });
    }
    return result;
  }

  return {
    stream: (async function* () {
      for await (const message of result.stream) {
        if (message.metadata && userID) {
          await trackModelUsage(userID, model, null, message.metadata.usage, {
            type,
            requestId,
            trace: message.metadata.trace,
          });
        }
        yield message;
      }
    })(),
  };
}

ConversationService.setInvoker(invokeModel);

const app = createCmsApplication({
  service: new ConversationService(),
  source: "internal-http",
});

// ===== SHARED MIDDLEWARE =====

function requestContextMiddleware(req, res, next) {
  try {
    const context = parseInternalUserIdHeader(req.headers["x-user-id"], {
      requestId: req.headers["x-request-id"],
    });
    if (!context) {
      return res.status(400).json({ error: "X-User-Id header required" });
    }
    req.context = context;
    next();
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
}

// ===== V1 ROUTER =====

const v1 = Router();
v1.use(json({ limit: 1024 ** 3 }));
v1.use(logRequests());
v1.use(requestContextMiddleware);

// -- Agents --

v1.post(
  "/agents",
  routeHandler(async (req, res) => {
    const agent = await app.createAgent(req.context, req.body);
    res.status(201).json(agent);
  })
);

v1.get(
  "/agents",
  routeHandler(async (req, res) => {
    const agents = await app.getAgents(req.context);
    res.json(agents);
  })
);

v1.get(
  "/agents/:id",
  routeHandler(async (req, res) => {
    const agent = await app.getAgent(req.context, req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  })
);

v1.put(
  "/agents/:id",
  routeHandler(async (req, res) => {
    const agent = await app.updateAgent(req.context, req.params.id, req.body);
    res.json(agent);
  })
);

v1.delete(
  "/agents/:id",
  routeHandler(async (req, res) => {
    await app.deleteAgent(req.context, req.params.id);
    res.json({ success: true });
  })
);

// -- Conversations --

v1.post(
  "/conversations",
  routeHandler(async (req, res) => {
    const conversation = await app.createConversation(req.context, req.body);
    res.status(201).json(conversation);
  })
);

v1.get(
  "/conversations",
  routeHandler(async (req, res) => {
    const { limit, offset } = req.query;
    const parsedLimit = parseInt(limit) || 20;
    const parsedOffset = parseInt(offset) || 0;
    const result = await app.getConversations(req.context, {
      limit: parsedLimit,
      offset: parsedOffset,
    });
    res.json(result);
  })
);

v1.get(
  "/conversations/:id",
  routeHandler(async (req, res) => {
    const conversation = await app.getConversation(req.context, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    res.json(conversation);
  })
);

v1.put(
  "/conversations/:id",
  routeHandler(async (req, res) => {
    const conversation = await app.updateConversation(req.context, req.params.id, req.body);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    res.json(conversation);
  })
);

v1.delete(
  "/conversations/:id",
  routeHandler(async (req, res) => {
    await app.deleteConversation(req.context, req.params.id);
    res.json({ success: true });
  })
);

// -- Context --

v1.get(
  "/conversations/:id/context",
  routeHandler(async (req, res) => {
    const compressed = req.query.compressed === "true";
    const context = await app.getContext(req.context, req.params.id, { compressed });
    if (!context) return res.status(404).json({ error: "Conversation not found" });
    res.json(context);
  })
);

// -- Summarization --

v1.post("/conversations/:conversationId/summarize", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");

  try {
    for await (const event of app.summarize(req.context, req.params.conversationId, req.body)) {
      res.write(JSON.stringify(event) + "\n");
    }
  } catch (error) {
    res.write(JSON.stringify({ error: error.message }) + "\n");
  }
  res.end();
});

// -- Messages --

v1.post(
  "/conversations/:conversationId/messages",
  routeHandler(async (req, res) => {
    const message = await app.appendConversationMessage(req.context, {
      conversationId: Number(req.params.conversationId),
      ...req.body,
    });
    res.status(201).json(message);
  })
);

v1.get(
  "/conversations/:conversationId/messages",
  routeHandler(async (req, res) => {
    const messages = await app.getMessages(req.context, req.params.conversationId);
    res.json(messages);
  })
);

v1.put(
  "/messages/:id",
  routeHandler(async (req, res) => {
    const message = await app.updateMessage(req.context, req.params.id, req.body);
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  })
);

v1.delete(
  "/messages/:id",
  routeHandler(async (req, res) => {
    await app.deleteMessage(req.context, req.params.id);
    res.json({ success: true });
  })
);

// -- Tools --

v1.post(
  "/tools",
  routeHandler(async (req, res) => {
    const tool = await app.createTool(req.body);
    res.status(201).json(tool);
  })
);

v1.get(
  "/tools",
  routeHandler(async (req, res) => {
    const tools = await app.getTools(req.context);
    res.json(tools);
  })
);

v1.get(
  "/tools/:id",
  routeHandler(async (req, res) => {
    const tool = await app.getTool(req.params.id);
    if (!tool) return res.status(404).json({ error: "Tool not found" });
    res.json(tool);
  })
);

v1.put(
  "/tools/:id",
  routeHandler(async (req, res) => {
    const tool = await app.updateTool(req.params.id, req.body);
    if (!tool) return res.status(404).json({ error: "Tool not found" });
    res.json(tool);
  })
);

v1.delete(
  "/tools/:id",
  routeHandler(async (req, res) => {
    await app.deleteTool(req.params.id);
    res.json({ success: true });
  })
);

v1.get(
  "/tools/:id/vectors",
  routeHandler(async (req, res) => {
    const vectors = await app.searchVectors({ toolID: req.params.id });
    res.json(vectors);
  })
);

// -- Prompts --

v1.post(
  "/prompts",
  routeHandler(async (req, res) => {
    const prompt = await app.createPrompt(req.body);
    res.status(201).json(prompt);
  })
);

v1.get(
  "/prompts",
  routeHandler(async (req, res) => {
    const prompts = await app.getPrompts();
    res.json(prompts);
  })
);

v1.get(
  "/prompts/:id",
  routeHandler(async (req, res) => {
    const prompt = await app.getPrompt(req.params.id);
    if (!prompt) return res.status(404).json({ error: "Prompt not found" });
    res.json(prompt);
  })
);

v1.put(
  "/prompts/:id",
  routeHandler(async (req, res) => {
    const prompt = await app.updatePrompt(req.params.id, req.body);
    if (!prompt) return res.status(404).json({ error: "Prompt not found" });
    res.json(prompt);
  })
);

v1.delete(
  "/prompts/:id",
  routeHandler(async (req, res) => {
    await app.deletePrompt(req.params.id);
    res.json({ success: true });
  })
);

// -- Resources --

v1.post(
  "/resources",
  routeHandler(async (req, res) => {
    const resource = await app.storeConversationResource(req.context, req.body);
    res.status(201).json(resource);
  })
);

v1.get(
  "/resources/:id",
  routeHandler(async (req, res) => {
    const resource = await app.getResource(req.context, req.params.id);
    if (!resource) return res.status(404).json({ error: "Resource not found" });
    res.json(resource);
  })
);

v1.put(
  "/resources/:id",
  routeHandler(async (req, res) => {
    const resource = await app.updateConversationResource(req.context, req.params.id, req.body);
    if (!resource) return res.status(404).json({ error: "Resource not found" });
    res.json(resource);
  })
);

v1.get(
  "/agents/:agentId/resources",
  routeHandler(async (req, res) => {
    const resources = await app.getResourcesByAgent(req.context, req.params.agentId);
    res.json(resources);
  })
);

v1.get(
  "/conversations/:conversationId/resources",
  routeHandler(async (req, res) => {
    const resources = await app.getResourcesByConversation(req.context, req.params.conversationId);
    res.json(resources);
  })
);

v1.delete(
  "/resources/:id",
  routeHandler(async (req, res) => {
    await app.deleteConversationResource(req.context, req.params.id);
    res.json({ success: true });
  })
);

// -- Vectors --

v1.post(
  "/vectors",
  routeHandler(async (req, res) => {
    const vectors = await app.storeConversationVectors(req.context, {
      conversationId: req.body.conversationID,
      vectors: req.body.vectors,
    });
    res.status(201).json(vectors);
  })
);

v1.get(
  "/vectors/search",
  routeHandler(async (req, res) => {
    const { toolID, conversationID, topN } = req.query;
    const embedding = req.query.embedding ? JSON.parse(req.query.embedding) : null;
    const results = await app.searchVectors({
      toolID: toolID || null,
      conversationID: conversationID || null,
      embedding,
      topN: parseInt(topN) || 10,
    });
    res.json(results);
  })
);

v1.get(
  "/conversations/:conversationId/vectors",
  routeHandler(async (req, res) => {
    const vectors = await app.getVectorsByConversation(req.context, req.params.conversationId);
    res.json(vectors);
  })
);

// -- Single message --

v1.get(
  "/messages/:id",
  routeHandler(async (req, res) => {
    const message = await app.getMessage(req.context, req.params.id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  })
);

// -- Resource vectors --

v1.get(
  "/resources/:resourceId/vectors",
  routeHandler(async (req, res) => {
    const vectors = await app.getVectorsByResource(req.context, req.params.resourceId);
    res.json(vectors);
  })
);

v1.delete(
  "/resources/:resourceId/vectors",
  routeHandler(async (req, res) => {
    const count = await app.deleteVectorsByResource(req.context, req.params.resourceId);
    res.json({ success: true, count });
  })
);

// -- Conversation vectors (delete) --

v1.delete(
  "/conversations/:id/vectors",
  routeHandler(async (req, res) => {
    const count = await app.deleteVectorsByConversation(req.context, req.params.id);
    res.json({ success: true, count });
  })
);

// -- Search (for recall tool) --

v1.post(
  "/search/messages",
  routeHandler(async (req, res) => {
    const results = await app.searchMessages(req.context, req.body);
    res.json(results);
  })
);

v1.post(
  "/search/vectors",
  routeHandler(async (req, res) => {
    const results = await app.searchResourceVectors(req.context, req.body);
    res.json(results);
  })
);

v1.post(
  "/search/chunks",
  routeHandler(async (req, res) => {
    const results = await app.searchChunks(req.context, req.body);
    res.json(results);
  })
);

v1.use(logErrors());

export { v1 as v1Router };
export default v1;
