import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";
import { routeHandler } from "shared/utils.js";
import { ConversationService } from "./conversation.js";

const api = Router();
const service = new ConversationService();

api.use(json({ limit: 1024 ** 3 })); // 1GB for file uploads
api.use(logRequests());

// Extract userId from header (internal service communication)
api.use((req, res, next) => {
  req.userId = req.headers["x-user-id"];
  if (!req.userId) {
    return res.status(400).json({ error: "X-User-Id header required" });
  }
  next();
});

// ===== AGENT ROUTES =====

api.post("/agents", routeHandler(async (req, res) => {
  const agent = await service.createAgent(req.userId, req.body);
  res.status(201).json(agent);
}));

api.get("/agents", routeHandler(async (req, res) => {
  const agents = await service.getAgents(req.userId);
  res.json(agents);
}));

api.get("/agents/:id", routeHandler(async (req, res) => {
  const agent = await service.getAgent(req.userId, req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(agent);
}));

api.put("/agents/:id", routeHandler(async (req, res) => {
  const existingAgent = await service.getAgent(req.userId, req.params.id);
  if (!existingAgent) return res.status(404).json({ error: "Agent not found" });
  if (existingAgent.userId === null) {
    return res.status(403).json({ error: "Cannot modify global agent" });
  }
  const agent = await service.updateAgent(req.userId, req.params.id, req.body);
  res.json(agent);
}));

api.delete("/agents/:id", routeHandler(async (req, res) => {
  await service.deleteAgent(req.userId, req.params.id);
  res.json({ success: true });
}));

// ===== THREAD ROUTES =====

api.post("/threads", routeHandler(async (req, res) => {
  const thread = await service.createThread(req.userId, req.body);
  res.status(201).json(thread);
}));

api.get("/threads", routeHandler(async (req, res) => {
  const { limit, offset } = req.query;
  const parsedLimit = parseInt(limit) || 20;
  const parsedOffset = parseInt(offset) || 0;
  const result = await service.getThreads(req.userId, { limit: parsedLimit, offset: parsedOffset });
  res.json({
    data: result.rows,
    meta: { total: result.count, limit: parsedLimit, offset: parsedOffset },
  });
}));

api.get("/threads/:id", routeHandler(async (req, res) => {
  const thread = await service.getThread(req.userId, req.params.id);
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  res.json(thread);
}));

api.put("/threads/:id", routeHandler(async (req, res) => {
  const thread = await service.updateThread(req.userId, req.params.id, req.body);
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  res.json(thread);
}));

api.delete("/threads/:id", routeHandler(async (req, res) => {
  await service.deleteThread(req.userId, req.params.id);
  res.json({ success: true });
}));

// ===== MESSAGE ROUTES =====

api.post("/threads/:threadId/messages", routeHandler(async (req, res) => {
  const message = await service.addMessage(req.userId, req.params.threadId, req.body);
  res.status(201).json(message);
}));

api.get("/threads/:threadId/messages", routeHandler(async (req, res) => {
  const messages = await service.getMessages(req.userId, req.params.threadId);
  res.json(messages);
}));

api.put("/messages/:id", routeHandler(async (req, res) => {
  const message = await service.updateMessage(req.userId, req.params.id, req.body);
  if (!message) return res.status(404).json({ error: "Message not found" });
  res.json(message);
}));

api.delete("/messages/:id", routeHandler(async (req, res) => {
  await service.deleteMessage(req.userId, req.params.id);
  res.json({ success: true });
}));

// ===== RESOURCE ROUTES =====

api.post("/resources", routeHandler(async (req, res) => {
  const resource = await service.addResource(req.userId, req.body);
  res.status(201).json(resource);
}));

api.get("/resources/:id", routeHandler(async (req, res) => {
  const resource = await service.getResource(req.userId, req.params.id);
  if (!resource) return res.status(404).json({ error: "Resource not found" });
  res.json(resource);
}));

api.get("/threads/:threadId/resources", routeHandler(async (req, res) => {
  const resources = await service.getResourcesByThread(req.userId, req.params.threadId);
  res.json(resources);
}));

api.delete("/resources/:id", routeHandler(async (req, res) => {
  await service.deleteResource(req.userId, req.params.id);
  res.json({ success: true });
}));

// ===== VECTOR ROUTES =====

api.post("/threads/:threadId/vectors", routeHandler(async (req, res) => {
  const vectors = await service.addVectors(req.userId, req.params.threadId, req.body.vectors);
  res.status(201).json(vectors);
}));

api.get("/threads/:threadId/vectors", routeHandler(async (req, res) => {
  const vectors = await service.getVectorsByThread(req.userId, req.params.threadId);
  res.json(vectors);
}));

api.use(logErrors());

export default api;
