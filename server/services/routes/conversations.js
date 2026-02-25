import { json, Router } from "express";

import { cmsClient } from "../clients/cms.js";
import { requireRole } from "../middleware.js";
import { routeHandler } from "../utils.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB for file uploads

// ===== AGENT ROUTES =====

api.post("/agents", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const agent = await cmsClient.createAgent(userId, req.body);
  res.status(201).json(agent);
}));

api.get("/agents", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const agents = await cmsClient.getAgents(userId);
  res.json(agents);
}));

api.get("/agents/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const agent = await cmsClient.getAgent(userId, req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(agent);
}));

api.put("/agents/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const existingAgent = await cmsClient.getAgent(userId, req.params.id);
  if (!existingAgent) return res.status(404).json({ error: "Agent not found" });
  if (existingAgent.userId === null) {
    return res.status(403).json({ error: "Cannot modify global agent" });
  }
  const agent = await cmsClient.updateAgent(userId, req.params.id, req.body);
  res.json(agent);
}));

api.delete("/agents/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  await cmsClient.deleteAgent(userId, req.params.id);
  res.json({ success: true });
}));

// ===== THREAD ROUTES =====

api.post("/threads", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const thread = await cmsClient.createThread(userId, req.body);
  res.status(201).json(thread);
}));

api.get("/threads", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const { limit, offset } = req.query;
  const parsedLimit = parseInt(limit) || 20;
  const parsedOffset = parseInt(offset) || 0;
  const result = await cmsClient.getThreads(userId, { limit: parsedLimit, offset: parsedOffset });

  // Normalize response format — both modes return { data, meta }
  if (result.data !== undefined) {
    res.json(result);
  } else {
    res.json({
      data: result.rows,
      meta: { total: result.count, limit: parsedLimit, offset: parsedOffset },
    });
  }
}));

api.get("/threads/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const thread = await cmsClient.getThread(userId, req.params.id);
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  res.json(thread);
}));

api.put("/threads/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const thread = await cmsClient.updateThread(userId, req.params.id, req.body);
  if (!thread) return res.status(404).json({ error: "Thread not found" });
  res.json(thread);
}));

api.delete("/threads/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  await cmsClient.deleteThread(userId, req.params.id);
  res.json({ success: true });
}));

// ===== MESSAGE ROUTES =====

api.post("/threads/:threadId/messages", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const message = await cmsClient.addMessage(userId, req.params.threadId, req.body);
  res.status(201).json(message);
}));

api.get("/threads/:threadId/messages", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const messages = await cmsClient.getMessages(userId, req.params.threadId);
  res.json(messages);
}));

api.put("/messages/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const message = await cmsClient.updateMessage(userId, req.params.id, req.body);
  if (!message) return res.status(404).json({ error: "Message not found" });
  res.json(message);
}));

api.delete("/messages/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  await cmsClient.deleteMessage(userId, req.params.id);
  res.json({ success: true });
}));

// ===== RESOURCE ROUTES =====

api.post("/resources", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const resource = await cmsClient.addResource(userId, req.body);
  res.status(201).json(resource);
}));

api.get("/resources/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const resource = await cmsClient.getResource(userId, req.params.id);
  if (!resource) return res.status(404).json({ error: "Resource not found" });
  res.json(resource);
}));

api.get("/threads/:threadId/resources", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const resources = await cmsClient.getResourcesByThread(userId, req.params.threadId);
  res.json(resources);
}));

api.delete("/resources/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  await cmsClient.deleteResource(userId, req.params.id);
  res.json({ success: true });
}));

// ===== VECTOR ROUTES =====

api.post("/threads/:threadId/vectors", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const vectors = await cmsClient.addVectors(userId, req.params.threadId, req.body.vectors);
  res.status(201).json(vectors);
}));

api.get("/threads/:threadId/vectors", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const vectors = await cmsClient.getVectorsByThread(userId, req.params.threadId);
  res.json(vectors);
}));

export default api;
