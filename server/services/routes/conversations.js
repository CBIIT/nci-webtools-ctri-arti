import { json, Router } from "express";

import { cmsClient } from "../clients/cms.js";
import { requireRole } from "../middleware.js";
import { createHttpError } from "../utils.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB for file uploads

// ===== AGENT ROUTES =====

api.post("/agents", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const agent = await cmsClient.createAgent(userId, req.body);
    res.status(201).json(agent);
  } catch (error) {
    console.error("Error creating agent:", error);
    next(createHttpError(error.status || 500, error, "Failed to create agent"));
  }
});

api.get("/agents", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const agents = await cmsClient.getAgents(userId);
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    next(createHttpError(error.status || 500, error, "Failed to fetch agents"));
  }
});

api.get("/agents/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const agent = await cmsClient.getAgent(userId, req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (error) {
    console.error("Error fetching agent:", error);
    next(createHttpError(error.status || 500, error, "Failed to fetch agent"));
  }
});

api.put("/agents/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    // Check if agent exists and is global (userId is null)
    const existingAgent = await cmsClient.getAgent(userId, req.params.id);
    if (!existingAgent) return res.status(404).json({ error: "Agent not found" });
    if (existingAgent.userId === null) {
      return res.status(403).json({ error: "Cannot modify global agent" });
    }
    const agent = await cmsClient.updateAgent(userId, req.params.id, req.body);
    res.json(agent);
  } catch (error) {
    console.error("Error updating agent:", error);
    next(createHttpError(error.status || 500, error, "Failed to update agent"));
  }
});

api.delete("/agents/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await cmsClient.deleteAgent(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting agent:", error);
    next(createHttpError(error.status || 500, error, "Failed to delete agent"));
  }
});

// ===== THREAD ROUTES =====

api.post("/threads", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const thread = await cmsClient.createThread(userId, req.body);
    res.status(201).json(thread);
  } catch (error) {
    console.error("Error creating thread:", error);
    next(createHttpError(error.status || 500, error, "Failed to create thread"));
  }
});

api.get("/threads", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const { limit, offset } = req.query;
    const result = await cmsClient.getThreads(userId, {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
    });

    // In microservice mode, result comes pre-formatted
    // In monolith mode, result has rows/count structure
    if (result.data !== undefined) {
      res.json(result);
    } else {
      res.json({
        data: result.rows,
        meta: {
          total: result.count,
          limit: parseInt(limit) || 20,
          offset: parseInt(offset) || 0,
        },
      });
    }
  } catch (error) {
    console.error("Error fetching threads:", error);
    next(createHttpError(error.status || 500, error, "Failed to fetch threads"));
  }
});

api.get("/threads/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const thread = await cmsClient.getThread(userId, req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json(thread);
  } catch (error) {
    console.error("Error fetching thread:", error);
    next(createHttpError(error.status || 500, error, "Failed to fetch thread"));
  }
});

api.put("/threads/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const thread = await cmsClient.updateThread(userId, req.params.id, req.body);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json(thread);
  } catch (error) {
    console.error("Error updating thread:", error);
    next(createHttpError(error.status || 500, error, "Failed to update thread"));
  }
});

api.delete("/threads/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await cmsClient.deleteThread(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting thread:", error);
    next(createHttpError(error.status || 500, error, "Failed to delete thread"));
  }
});

// ===== MESSAGE ROUTES =====

api.post("/threads/:threadId/messages", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const message = await cmsClient.addMessage(userId, req.params.threadId, req.body);
    res.status(201).json(message);
  } catch (error) {
    console.error("Error adding message:", error);
    next(createHttpError(error.status || 500, error, "Failed to add message"));
  }
});

api.get("/threads/:threadId/messages", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const messages = await cmsClient.getMessages(userId, req.params.threadId);
    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    next(createHttpError(error.status || 500, error, "Failed to fetch messages"));
  }
});

api.put("/messages/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const message = await cmsClient.updateMessage(userId, req.params.id, req.body);
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  } catch (error) {
    console.error("Error updating message:", error);
    next(createHttpError(error.status || 500, error, "Failed to update message"));
  }
});

api.delete("/messages/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await cmsClient.deleteMessage(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    next(createHttpError(error.status || 500, error, "Failed to delete message"));
  }
});

// ===== RESOURCE ROUTES =====

api.post("/resources", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const resource = await cmsClient.addResource(userId, req.body);
    res.status(201).json(resource);
  } catch (error) {
    console.error("Error adding resource:", error);
    next(createHttpError(error.status || 500, error, "Failed to add resource"));
  }
});

api.get("/resources/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const resource = await cmsClient.getResource(userId, req.params.id);
    if (!resource) return res.status(404).json({ error: "Resource not found" });
    res.json(resource);
  } catch (error) {
    console.error("Error fetching resource:", error);
    next(createHttpError(error.status || 500, error, "Failed to fetch resource"));
  }
});

api.get("/threads/:threadId/resources", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const resources = await cmsClient.getResourcesByThread(userId, req.params.threadId);
    res.json(resources);
  } catch (error) {
    console.error("Error fetching resources:", error);
    next(createHttpError(error.status || 500, error, "Failed to fetch resources"));
  }
});

api.delete("/resources/:id", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await cmsClient.deleteResource(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting resource:", error);
    next(createHttpError(error.status || 500, error, "Failed to delete resource"));
  }
});

// ===== VECTOR ROUTES =====

api.post("/threads/:threadId/vectors", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const vectors = await cmsClient.addVectors(userId, req.params.threadId, req.body.vectors);
    res.status(201).json(vectors);
  } catch (error) {
    console.error("Error adding vectors:", error);
    next(createHttpError(error.status || 500, error, "Failed to add vectors"));
  }
});

api.get("/threads/:threadId/vectors", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const vectors = await cmsClient.getVectorsByThread(userId, req.params.threadId);
    res.json(vectors);
  } catch (error) {
    console.error("Error fetching vectors:", error);
    next(createHttpError(error.status || 500, error, "Failed to fetch vectors"));
  }
});

export default api;
