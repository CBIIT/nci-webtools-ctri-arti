import { json, Router } from "express";
import { logErrors, logRequests } from "../middleware.js";
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

api.post("/agents", async (req, res, next) => {
  try {
    const agent = await service.createAgent(req.userId, req.body);
    res.status(201).json(agent);
  } catch (error) {
    console.error("Error creating agent:", error);
    next(error);
  }
});

api.get("/agents", async (req, res, next) => {
  try {
    const agents = await service.getAgents(req.userId);
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    next(error);
  }
});

api.get("/agents/:id", async (req, res, next) => {
  try {
    const agent = await service.getAgent(req.userId, req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (error) {
    console.error("Error fetching agent:", error);
    next(error);
  }
});

api.put("/agents/:id", async (req, res, next) => {
  try {
    const existingAgent = await service.getAgent(req.userId, req.params.id);
    if (!existingAgent) return res.status(404).json({ error: "Agent not found" });
    if (existingAgent.userId === null) {
      return res.status(403).json({ error: "Cannot modify global agent" });
    }
    const agent = await service.updateAgent(req.userId, req.params.id, req.body);
    res.json(agent);
  } catch (error) {
    console.error("Error updating agent:", error);
    next(error);
  }
});

api.delete("/agents/:id", async (req, res, next) => {
  try {
    await service.deleteAgent(req.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting agent:", error);
    next(error);
  }
});

// ===== THREAD ROUTES =====

api.post("/threads", async (req, res, next) => {
  try {
    const thread = await service.createThread(req.userId, req.body);
    res.status(201).json(thread);
  } catch (error) {
    console.error("Error creating thread:", error);
    next(error);
  }
});

api.get("/threads", async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = await service.getThreads(req.userId, {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
    });
    res.json({
      data: result.rows,
      meta: {
        total: result.count,
        limit: parseInt(limit) || 20,
        offset: parseInt(offset) || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching threads:", error);
    next(error);
  }
});

api.get("/threads/:id", async (req, res, next) => {
  try {
    const thread = await service.getThread(req.userId, req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json(thread);
  } catch (error) {
    console.error("Error fetching thread:", error);
    next(error);
  }
});

api.put("/threads/:id", async (req, res, next) => {
  try {
    const thread = await service.updateThread(req.userId, req.params.id, req.body);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json(thread);
  } catch (error) {
    console.error("Error updating thread:", error);
    next(error);
  }
});

api.delete("/threads/:id", async (req, res, next) => {
  try {
    await service.deleteThread(req.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting thread:", error);
    next(error);
  }
});

// ===== MESSAGE ROUTES =====

api.post("/threads/:threadId/messages", async (req, res, next) => {
  try {
    const message = await service.addMessage(req.userId, req.params.threadId, req.body);
    res.status(201).json(message);
  } catch (error) {
    console.error("Error adding message:", error);
    next(error);
  }
});

api.get("/threads/:threadId/messages", async (req, res, next) => {
  try {
    const messages = await service.getMessages(req.userId, req.params.threadId);
    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    next(error);
  }
});

api.put("/messages/:id", async (req, res, next) => {
  try {
    const message = await service.updateMessage(req.userId, req.params.id, req.body);
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  } catch (error) {
    console.error("Error updating message:", error);
    next(error);
  }
});

api.delete("/messages/:id", async (req, res, next) => {
  try {
    await service.deleteMessage(req.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    next(error);
  }
});

// ===== RESOURCE ROUTES =====

api.post("/resources", async (req, res, next) => {
  try {
    const resource = await service.addResource(req.userId, req.body);
    res.status(201).json(resource);
  } catch (error) {
    console.error("Error adding resource:", error);
    next(error);
  }
});

api.get("/resources/:id", async (req, res, next) => {
  try {
    const resource = await service.getResource(req.userId, req.params.id);
    if (!resource) return res.status(404).json({ error: "Resource not found" });
    res.json(resource);
  } catch (error) {
    console.error("Error fetching resource:", error);
    next(error);
  }
});

api.get("/threads/:threadId/resources", async (req, res, next) => {
  try {
    const resources = await service.getResourcesByThread(req.userId, req.params.threadId);
    res.json(resources);
  } catch (error) {
    console.error("Error fetching resources:", error);
    next(error);
  }
});

api.delete("/resources/:id", async (req, res, next) => {
  try {
    await service.deleteResource(req.userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting resource:", error);
    next(error);
  }
});

// ===== VECTOR ROUTES =====

api.post("/threads/:threadId/vectors", async (req, res, next) => {
  try {
    const vectors = await service.addVectors(req.userId, req.params.threadId, req.body.vectors);
    res.status(201).json(vectors);
  } catch (error) {
    console.error("Error adding vectors:", error);
    next(error);
  }
});

api.get("/threads/:threadId/vectors", async (req, res, next) => {
  try {
    const vectors = await service.getVectorsByThread(req.userId, req.params.threadId);
    res.json(vectors);
  } catch (error) {
    console.error("Error fetching vectors:", error);
    next(error);
  }
});

api.use(logErrors());

export default api;
