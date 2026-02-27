import { json, Router } from "express";
import { logErrors, logRequests } from "shared/middleware.js";
import { routeHandler } from "shared/utils.js";

import { ConversationService } from "./conversation.js";

const service = new ConversationService();

// ===== SHARED MIDDLEWARE =====

function userIdMiddleware(req, res, next) {
  req.userId = req.headers["x-user-id"];
  if (!req.userId) {
    return res.status(400).json({ error: "X-User-Id header required" });
  }
  next();
}

// ===== V1 ROUTER =====

const v1 = Router();
v1.use(json({ limit: 1024 ** 3 }));
v1.use(logRequests());
v1.use(userIdMiddleware);

// -- Agents --

v1.post("/agents", routeHandler(async (req, res) => {
  const agent = await service.createAgent(req.userId, req.body);
  res.status(201).json(agent);
}));

v1.get("/agents", routeHandler(async (req, res) => {
  const agents = await service.getAgents(req.userId);
  res.json(agents);
}));

v1.get("/agents/:id", routeHandler(async (req, res) => {
  const agent = await service.getAgent(req.userId, req.params.id);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(agent);
}));

v1.put("/agents/:id", routeHandler(async (req, res) => {
  const existingAgent = await service.getAgent(req.userId, req.params.id);
  if (!existingAgent) return res.status(404).json({ error: "Agent not found" });
  if (existingAgent.userID === null) {
    return res.status(403).json({ error: "Cannot modify global agent" });
  }
  const agent = await service.updateAgent(req.userId, req.params.id, req.body);
  res.json(agent);
}));

v1.delete("/agents/:id", routeHandler(async (req, res) => {
  await service.deleteAgent(req.userId, req.params.id);
  res.json({ success: true });
}));

// -- Conversations --

v1.post("/conversations", routeHandler(async (req, res) => {
  const conversation = await service.createConversation(req.userId, req.body);
  res.status(201).json(conversation);
}));

v1.get("/conversations", routeHandler(async (req, res) => {
  const { limit, offset } = req.query;
  const parsedLimit = parseInt(limit) || 20;
  const parsedOffset = parseInt(offset) || 0;
  const result = await service.getConversations(req.userId, { limit: parsedLimit, offset: parsedOffset });
  res.json({
    data: result.rows,
    meta: { total: result.count, limit: parsedLimit, offset: parsedOffset },
  });
}));

v1.get("/conversations/:id", routeHandler(async (req, res) => {
  const conversation = await service.getConversation(req.userId, req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  res.json(conversation);
}));

v1.put("/conversations/:id", routeHandler(async (req, res) => {
  const conversation = await service.updateConversation(req.userId, req.params.id, req.body);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  res.json(conversation);
}));

v1.delete("/conversations/:id", routeHandler(async (req, res) => {
  await service.deleteConversation(req.userId, req.params.id);
  res.json({ success: true });
}));

// -- Context --

v1.get("/conversations/:id/context", routeHandler(async (req, res) => {
  const context = await service.getContext(req.userId, req.params.id);
  if (!context) return res.status(404).json({ error: "Conversation not found" });
  res.json(context);
}));

// -- Compress --

v1.post("/conversations/:id/compress", routeHandler(async (req, res) => {
  const conversation = await service.compressConversation(req.userId, req.params.id, req.body);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });
  res.json(conversation);
}));

// -- Messages --

v1.post("/conversations/:conversationId/messages", routeHandler(async (req, res) => {
  const message = await service.addMessage(req.userId, req.params.conversationId, req.body);
  res.status(201).json(message);
}));

v1.get("/conversations/:conversationId/messages", routeHandler(async (req, res) => {
  const messages = await service.getMessages(req.userId, req.params.conversationId);
  res.json(messages);
}));

v1.put("/messages/:id", routeHandler(async (req, res) => {
  const message = await service.updateMessage(req.userId, req.params.id, req.body);
  if (!message) return res.status(404).json({ error: "Message not found" });
  res.json(message);
}));

v1.delete("/messages/:id", routeHandler(async (req, res) => {
  await service.deleteMessage(req.userId, req.params.id);
  res.json({ success: true });
}));

// -- Tools --

v1.post("/tools", routeHandler(async (req, res) => {
  const tool = await service.createTool(req.body);
  res.status(201).json(tool);
}));

v1.get("/tools", routeHandler(async (req, res) => {
  const tools = await service.getTools(req.userId);
  res.json(tools);
}));

v1.get("/tools/:id", routeHandler(async (req, res) => {
  const tool = await service.getTool(req.params.id);
  if (!tool) return res.status(404).json({ error: "Tool not found" });
  res.json(tool);
}));

v1.put("/tools/:id", routeHandler(async (req, res) => {
  const tool = await service.updateTool(req.params.id, req.body);
  if (!tool) return res.status(404).json({ error: "Tool not found" });
  res.json(tool);
}));

v1.delete("/tools/:id", routeHandler(async (req, res) => {
  await service.deleteTool(req.params.id);
  res.json({ success: true });
}));

v1.get("/tools/:id/vectors", routeHandler(async (req, res) => {
  const vectors = await service.searchVectors({ toolID: req.params.id });
  res.json(vectors);
}));

// -- Prompts --

v1.post("/prompts", routeHandler(async (req, res) => {
  const prompt = await service.createPrompt(req.body);
  res.status(201).json(prompt);
}));

v1.get("/prompts", routeHandler(async (req, res) => {
  const prompts = await service.getPrompts();
  res.json(prompts);
}));

v1.get("/prompts/:id", routeHandler(async (req, res) => {
  const prompt = await service.getPrompt(req.params.id);
  if (!prompt) return res.status(404).json({ error: "Prompt not found" });
  res.json(prompt);
}));

v1.put("/prompts/:id", routeHandler(async (req, res) => {
  const prompt = await service.updatePrompt(req.params.id, req.body);
  if (!prompt) return res.status(404).json({ error: "Prompt not found" });
  res.json(prompt);
}));

v1.delete("/prompts/:id", routeHandler(async (req, res) => {
  await service.deletePrompt(req.params.id);
  res.json({ success: true });
}));

// -- Resources --

v1.post("/resources", routeHandler(async (req, res) => {
  const resource = await service.addResource(req.userId, req.body);
  res.status(201).json(resource);
}));

v1.get("/resources/:id", routeHandler(async (req, res) => {
  const resource = await service.getResource(req.userId, req.params.id);
  if (!resource) return res.status(404).json({ error: "Resource not found" });
  res.json(resource);
}));

v1.get("/agents/:agentId/resources", routeHandler(async (req, res) => {
  const resources = await service.getResourcesByAgent(req.userId, req.params.agentId);
  res.json(resources);
}));

v1.delete("/resources/:id", routeHandler(async (req, res) => {
  await service.deleteResource(req.userId, req.params.id);
  res.json({ success: true });
}));

// -- Vectors --

v1.post("/vectors", routeHandler(async (req, res) => {
  const vectors = await service.addVectors(req.userId, req.body.conversationID, req.body.vectors);
  res.status(201).json(vectors);
}));

v1.get("/vectors/search", routeHandler(async (req, res) => {
  const { toolID, conversationID, topN } = req.query;
  const embedding = req.query.embedding ? JSON.parse(req.query.embedding) : null;
  const results = await service.searchVectors({
    toolID: toolID || null,
    conversationID: conversationID || null,
    embedding,
    topN: parseInt(topN) || 10,
  });
  res.json(results);
}));

v1.get("/conversations/:conversationId/vectors", routeHandler(async (req, res) => {
  const vectors = await service.getVectorsByConversation(req.userId, req.params.conversationId);
  res.json(vectors);
}));

v1.use(logErrors());

export { v1 as v1Router };
export default v1;
