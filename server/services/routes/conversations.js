import { json, Router } from "express";

import { amsClient } from "../clients/ams.js";
import { cmsClient } from "../clients/cms.js";
import { requireRole } from "../middleware.js";
import { routeHandler } from "../utils.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB for file uploads

// ===== AGENT ROUTES =====

api.post("/agents", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const agent = await amsClient.createAgent(userId, req.body);
  res.status(201).json(agent);
}));

api.get("/agents", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const agents = await amsClient.getAgents(userId);
  res.json(agents);
}));

api.get("/agents/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const agent = await amsClient.getAgent(userId, req.params.id);
  res.json(agent);
}));

api.put("/agents/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const agent = await amsClient.updateAgent(userId, req.params.id, req.body);
  res.json(agent);
}));

api.delete("/agents/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  await amsClient.deleteAgent(userId, req.params.id);
  res.json({ success: true });
}));

// ===== CONVERSATION ROUTES =====

api.post("/conversations", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const conversation = await cmsClient.createConversation(userId, req.body);
  res.status(201).json(conversation);
}));

api.get("/conversations", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const { limit, offset } = req.query;
  const parsedLimit = parseInt(limit) || 20;
  const parsedOffset = parseInt(offset) || 0;
  const result = await cmsClient.getConversations(userId, { limit: parsedLimit, offset: parsedOffset });

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

api.get("/conversations/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const conversation = await cmsClient.getConversation(userId, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  res.json(conversation);
}));

api.put("/conversations/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const conversation = await cmsClient.updateConversation(userId, req.params.id, req.body);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  res.json(conversation);
}));

api.delete("/conversations/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  await cmsClient.deleteConversation(userId, req.params.id);
  res.json({ success: true });
}));

// ===== MESSAGE ROUTES =====

api.post("/conversations/:conversationId/messages", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const message = await cmsClient.addMessage(userId, req.params.conversationId, req.body);
  res.status(201).json(message);
}));

api.get("/conversations/:conversationId/messages", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const messages = await cmsClient.getMessages(userId, req.params.conversationId);
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

api.get("/conversations/:conversationId/resources", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const resources = await cmsClient.getResourcesByConversation(userId, req.params.conversationId);
  res.json(resources);
}));

api.delete("/resources/:id", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  await cmsClient.deleteResource(userId, req.params.id);
  res.json({ success: true });
}));

// ===== VECTOR ROUTES =====

api.post("/conversations/:conversationId/vectors", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const vectors = await cmsClient.addVectors(userId, req.params.conversationId, req.body.vectors);
  res.status(201).json(vectors);
}));

api.get("/conversations/:conversationId/vectors", requireRole(), routeHandler(async (req, res) => {
  const userId = req.session.user.id;
  const vectors = await cmsClient.getVectorsByConversation(userId, req.params.conversationId);
  res.json(vectors);
}));

export default api;
