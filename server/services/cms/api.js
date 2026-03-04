import { json, Router } from "express";
import { logErrors, logRequests } from "../middleware.js";
import { routeHandler } from "../utils.js";
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

// ===== CONVERSATION ROUTES =====

api.post("/conversations", routeHandler(async (req, res) => {
  const conversation = await service.createConversation(req.userId, req.body);
  res.status(201).json(conversation);
}));

api.get("/conversations", routeHandler(async (req, res) => {
  const { limit, offset } = req.query;
  const parsedLimit = parseInt(limit) || 20;
  const parsedOffset = parseInt(offset) || 0;
  const result = await service.getConversations(req.userId, { limit: parsedLimit, offset: parsedOffset });
  res.json({
    data: result.rows,
    meta: { total: result.count, limit: parsedLimit, offset: parsedOffset },
  });
}));

api.get("/conversations/:id", routeHandler(async (req, res) => {
  const conversation = await service.getConversation(req.userId, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  res.json(conversation);
}));

api.put("/conversations/:id", routeHandler(async (req, res) => {
  const conversation = await service.updateConversation(req.userId, req.params.id, req.body);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  res.json(conversation);
}));

api.delete("/conversations/:id", routeHandler(async (req, res) => {
  await service.deleteConversation(req.userId, req.params.id);
  res.json({ success: true });
}));

// ===== MESSAGE ROUTES =====

api.post("/conversations/:conversationId/messages", routeHandler(async (req, res) => {
  const message = await service.addMessage(req.userId, req.params.conversationId, req.body);
  res.status(201).json(message);
}));

api.get("/conversations/:conversationId/messages", routeHandler(async (req, res) => {
  const messages = await service.getMessages(req.userId, req.params.conversationId);
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

api.get("/conversations/:conversationId/resources", routeHandler(async (req, res) => {
  const resources = await service.getResourcesByConversation(req.userId, req.params.conversationId);
  res.json(resources);
}));

api.delete("/resources/:id", routeHandler(async (req, res) => {
  await service.deleteResource(req.userId, req.params.id);
  res.json({ success: true });
}));

// ===== VECTOR ROUTES =====

api.post("/conversations/:conversationId/vectors", routeHandler(async (req, res) => {
  const vectors = await service.addVectors(req.userId, req.params.conversationId, req.body.vectors);
  res.status(201).json(vectors);
}));

api.get("/conversations/:conversationId/vectors", routeHandler(async (req, res) => {
  const vectors = await service.getVectorsByConversation(req.userId, req.params.conversationId);
  res.json(vectors);
}));

api.use(logErrors());

export default api;
