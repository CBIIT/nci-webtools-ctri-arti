import { json, Router } from "express";
import { requireRole } from "../middleware.js";
import { conversationService } from "../conversation.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB for file uploads

// ===== AGENT ROUTES =====

api.post("/agents", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const agent = await conversationService.createAgent(userId, req.body);
    res.status(201).json(agent);
  } catch (error) {
    console.error("Error creating agent:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

api.get("/agents", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const agents = await conversationService.getAgents(userId);
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

api.get("/agents/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const agent = await conversationService.getAgent(userId, req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

api.put("/agents/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const agent = await conversationService.updateAgent(userId, req.params.id, req.body);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  } catch (error) {
    console.error("Error updating agent:", error);
    res.status(500).json({ error: "Failed to update agent" });
  }
});

api.delete("/agents/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    await conversationService.deleteAgent(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting agent:", error);
    res.status(500).json({ error: "Failed to delete agent" });
  }
});

// ===== THREAD ROUTES =====

api.post("/threads", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const thread = await conversationService.createThread(userId, req.body);
    res.status(201).json(thread);
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

api.get("/threads", requireRole(), async (req, res) => {
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
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

api.get("/threads/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const thread = await conversationService.getThread(userId, req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json(thread);
  } catch (error) {
    console.error("Error fetching thread:", error);
    res.status(500).json({ error: "Failed to fetch thread" });
  }
});

api.put("/threads/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const thread = await conversationService.updateThread(userId, req.params.id, req.body);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    res.json(thread);
  } catch (error) {
    console.error("Error updating thread:", error);
    res.status(500).json({ error: "Failed to update thread" });
  }
});

api.delete("/threads/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    await conversationService.deleteThread(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting thread:", error);
    res.status(500).json({ error: "Failed to delete thread" });
  }
});

// ===== MESSAGE ROUTES =====

api.post("/threads/:threadId/messages", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const message = await conversationService.addMessage(userId, req.params.threadId, req.body);
    res.status(201).json(message);
  } catch (error) {
    console.error("Error adding message:", error);
    res.status(500).json({ error: "Failed to add message" });
  }
});

api.get("/threads/:threadId/messages", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const messages = await conversationService.getMessages(userId, req.params.threadId);
    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

api.put("/messages/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const message = await conversationService.updateMessage(userId, req.params.id, req.body);
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  } catch (error) {
    console.error("Error updating message:", error);
    res.status(500).json({ error: "Failed to update message" });
  }
});

api.delete("/messages/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    await conversationService.deleteMessage(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// ===== RESOURCE ROUTES =====

api.post("/resources", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const resource = await conversationService.addResource(userId, req.body);
    res.status(201).json(resource);
  } catch (error) {
    console.error("Error adding resource:", error);
    res.status(500).json({ error: "Failed to add resource" });
  }
});

api.get("/resources/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const resource = await conversationService.getResource(userId, req.params.id);
    if (!resource) return res.status(404).json({ error: "Resource not found" });
    res.json(resource);
  } catch (error) {
    console.error("Error fetching resource:", error);
    res.status(500).json({ error: "Failed to fetch resource" });
  }
});

api.get("/threads/:threadId/resources", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const resources = await conversationService.getResourcesByThread(userId, req.params.threadId);
    res.json(resources);
  } catch (error) {
    console.error("Error fetching resources:", error);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

api.delete("/resources/:id", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    await conversationService.deleteResource(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting resource:", error);
    res.status(500).json({ error: "Failed to delete resource" });
  }
});

// ===== VECTOR ROUTES =====

api.post("/threads/:threadId/vectors", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const vectors = await conversationService.addVectors(userId, req.params.threadId, req.body.vectors);
    res.status(201).json(vectors);
  } catch (error) {
    console.error("Error adding vectors:", error);
    res.status(500).json({ error: "Failed to add vectors" });
  }
});

api.get("/threads/:threadId/vectors", requireRole(), async (req, res) => {
  try {
    const userId = req.session.user.id;
    const vectors = await conversationService.getVectorsByThread(userId, req.params.threadId);
    res.json(vectors);
  } catch (error) {
    console.error("Error fetching vectors:", error);
    res.status(500).json({ error: "Failed to fetch vectors" });
  }
});

export default api;
