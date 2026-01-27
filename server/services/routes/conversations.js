import { json, Router } from "express";

import { conversationService } from "../conversation.js";
import { requireRole } from "../middleware.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB for file uploads

// ===== AGENT ROUTES =====

api.post("/agents", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const agent = await conversationService.createAgent(userId, req.body);
    res.status(201).json(agent);
  } catch (error) {
    console.error("Error creating agent:", error);
    error.statusCode = 500;
    error.message = "Failed to create agent";
    next(error);
  }
});

api.get("/agents", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const agents = await conversationService.getAgents(userId);
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    error.statusCode = 500;
    error.message = "Failed to fetch agents";
    next(error);
  }
});

api.get("/agents/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const agent = await conversationService.getAgent(userId, req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (error) {
    console.error("Error fetching agent:", error);
    error.statusCode = 500;
    error.message = "Failed to fetch agent";
    next(error);
  }
});

api.put("/agents/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    // Check if agent exists and is global (userId is null)
    const existingAgent = await conversationService.getAgent(userId, req.params.id);
    if (!existingAgent) return res.status(404).json({ error: "Agent not found" });
    if (existingAgent.userId === null) {
      return res.status(403).json({ error: "Cannot modify global agent" });
    }
    const agent = await conversationService.updateAgent(userId, req.params.id, req.body);
    res.json(agent);
  } catch (error) {
    console.error("Error updating agent:", error);
    error.statusCode = 500;
    error.message = "Failed to update agent";
    next(error);
  }
});

api.delete("/agents/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await conversationService.deleteAgent(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting agent:", error);
    error.statusCode = 500;
    error.message = "Failed to delete agent";
    next(error);
  }
});

// ===== THREAD ROUTES =====

api.post("/threads", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const thread = await conversationService.createThread(userId, req.body);
    res.status(201).json(thread);
  } catch (error) {
    console.error("Error creating thread:", error);
    error.statusCode = 500;
    error.message = "Failed to create thread";
    next(error);
  }
});

api.get("/threads", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { limit, offset } = req.query;
    const result = await conversationService.getThreads(userId, {
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
    error.statusCode = 500;
    error.message = "Failed to fetch threads";
    next(error);
  }
});

api.get("/threads/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const thread = await conversationService.getThread(userId, req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json(thread);
  } catch (error) {
    console.error("Error fetching thread:", error);
    error.statusCode = 500;
    error.message = "Failed to fetch thread";
    next(error);
  }
});

api.put("/threads/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const thread = await conversationService.updateThread(userId, req.params.id, req.body);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json(thread);
  } catch (error) {
    console.error("Error updating thread:", error);
    error.statusCode = 500;
    error.message = "Failed to update thread";
    next(error);
  }
});

api.delete("/threads/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await conversationService.deleteThread(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting thread:", error);
    error.statusCode = 500;
    error.message = "Failed to delete thread";
    next(error);
  }
});

// ===== MESSAGE ROUTES =====

api.post("/threads/:threadId/messages", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const message = await conversationService.addMessage(userId, req.params.threadId, req.body);
    res.status(201).json(message);
  } catch (error) {
    console.error("Error adding message:", error);
    error.statusCode = 500;
    error.message = "Failed to add message";
    next(error);
  }
});

api.get("/threads/:threadId/messages", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const messages = await conversationService.getMessages(userId, req.params.threadId);
    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    error.statusCode = 500;
    error.message = "Failed to fetch messages";
    next(error);
  }
});

api.put("/messages/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const message = await conversationService.updateMessage(userId, req.params.id, req.body);
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  } catch (error) {
    console.error("Error updating message:", error);
    error.statusCode = 500;
    error.message = "Failed to update message";
    next(error);
  }
});

api.delete("/messages/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await conversationService.deleteMessage(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    error.statusCode = 500;
    error.message = "Failed to delete message";
    next(error);
  }
});

// ===== RESOURCE ROUTES =====

api.post("/resources", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const resource = await conversationService.addResource(userId, req.body);
    res.status(201).json(resource);
  } catch (error) {
    console.error("Error adding resource:", error);
    error.statusCode = 500;
    error.message = "Failed to add resource";
    next(error);
  }
});

api.get("/resources/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const resource = await conversationService.getResource(userId, req.params.id);
    if (!resource) return res.status(404).json({ error: "Resource not found" });
    res.json(resource);
  } catch (error) {
    console.error("Error fetching resource:", error);
    error.statusCode = 500;
    error.message = "Failed to fetch resource";
    next(error);
  }
});

api.get("/threads/:threadId/resources", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const resources = await conversationService.getResourcesByThread(userId, req.params.threadId);
    res.json(resources);
  } catch (error) {
    console.error("Error fetching resources:", error);
    error.statusCode = 500;
    error.message = "Failed to fetch resources";
    next(error);
  }
});

api.delete("/resources/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await conversationService.deleteResource(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting resource:", error);
    error.statusCode = 500;
    error.message = "Failed to delete resource";
    next(error);
  }
});

// ===== VECTOR ROUTES =====

api.post("/threads/:threadId/vectors", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const vectors = await conversationService.addVectors(
      userId,
      req.params.threadId,
      req.body.vectors
    );
    res.status(201).json(vectors);
  } catch (error) {
    console.error("Error adding vectors:", error);
    error.statusCode = 500;
    error.message = "Failed to add vectors";
    next(error);
  }
});

api.get("/threads/:threadId/vectors", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const vectors = await conversationService.getVectorsByThread(userId, req.params.threadId);
    res.json(vectors);
  } catch (error) {
    console.error("Error fetching vectors:", error);
    error.statusCode = 500;
    error.message = "Failed to fetch vectors";
    next(error);
  }
});

export default api;
