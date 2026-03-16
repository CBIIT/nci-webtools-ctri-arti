import { json, Router } from "express";
import { cmsClient } from "shared/clients/cms.js";
import { requireRole } from "users/middleware.js";

import { getUserId, routeHandler } from "../utils.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB for file uploads

function getMimeTypeFromResource(resource) {
  const format = (
    resource?.metadata?.format ||
    resource?.name?.split(".").pop() ||
    ""
  ).toLowerCase();
  const types = {
    txt: "text/plain; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    json: "application/json; charset=utf-8",
    xml: "application/xml; charset=utf-8",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };

  if (resource?.metadata?.encoding === "base64") {
    return types[format] || "application/octet-stream";
  }

  if (["txt", "md", "html", "htm", "csv", "json", "xml"].includes(format)) {
    return types[format];
  }

  return "text/plain; charset=utf-8";
}

function getDownloadFilename(resource) {
  const name = resource?.name || `resource-${resource?.id || "download"}`;
  const format = (resource?.metadata?.format || name.split(".").pop() || "").toLowerCase();
  const exactTextFormats = new Set(["txt", "md", "csv", "json", "html", "htm", "xml"]);

  if (resource?.metadata?.encoding === "base64" || exactTextFormats.has(format)) {
    return name;
  }

  return name.endsWith(".txt") ? name : `${name}.txt`;
}

// ===== CONVERSATION ROUTES =====

api.post(
  "/conversations",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const conversation = await cmsClient.createConversation(userId, req.body);
    res.status(201).json(conversation);
  })
);

api.get(
  "/conversations",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const { limit, offset } = req.query;
    const parsedLimit = parseInt(limit) || 20;
    const parsedOffset = parseInt(offset) || 0;
    const result = await cmsClient.getConversations(userId, {
      limit: parsedLimit,
      offset: parsedOffset,
    });
    res.json(result);
  })
);

api.get(
  "/conversations/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const conversation = await cmsClient.getConversation(userId, req.params.id);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    res.json(conversation);
  })
);

api.put(
  "/conversations/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const conversation = await cmsClient.updateConversation(userId, req.params.id, req.body);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    res.json(conversation);
  })
);

api.delete(
  "/conversations/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    await cmsClient.deleteConversation(userId, req.params.id);
    res.json({ success: true });
  })
);

// ===== CONTEXT ROUTES =====

api.get(
  "/conversations/:id/context",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const compressed = req.query.compressed === "true";
    const context = await cmsClient.getContext(userId, req.params.id, { compressed });
    if (!context) return res.status(404).json({ error: "Conversation not found" });
    res.json(context);
  })
);

// ===== MESSAGE ROUTES =====

api.post(
  "/conversations/:conversationId/messages",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const message = await cmsClient.addMessage(userId, req.params.conversationId, req.body);
    res.status(201).json(message);
  })
);

api.get(
  "/conversations/:conversationId/messages",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const messages = await cmsClient.getMessages(userId, req.params.conversationId);
    res.json(messages);
  })
);

api.put(
  "/messages/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const message = await cmsClient.updateMessage(userId, req.params.id, req.body);
    if (!message) return res.status(404).json({ error: "Message not found" });
    res.json(message);
  })
);

api.delete(
  "/messages/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    await cmsClient.deleteMessage(userId, req.params.id);
    res.json({ success: true });
  })
);

// ===== RESOURCE ROUTES =====

api.post(
  "/resources",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const resource = await cmsClient.addResource(userId, req.body);
    res.status(201).json(resource);
  })
);

api.get(
  "/resources/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const resource = await cmsClient.getResource(userId, req.params.id);
    if (!resource) return res.status(404).json({ error: "Resource not found" });
    res.json(resource);
  })
);

api.get(
  "/resources/:id/download",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const resource = await cmsClient.getResource(userId, req.params.id);
    if (!resource) return res.status(404).json({ error: "Resource not found" });

    const filename = getDownloadFilename(resource);
    const contentType = getMimeTypeFromResource(resource);
    const content =
      resource?.metadata?.encoding === "base64"
        ? Buffer.from(resource.content || "", "base64")
        : Buffer.from(resource.content || "", "utf-8");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  })
);

api.put(
  "/resources/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const resource = await cmsClient.updateResource(userId, req.params.id, req.body);
    if (!resource) return res.status(404).json({ error: "Resource not found" });
    res.json(resource);
  })
);

api.get(
  "/agents/:agentId/resources",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const resources = await cmsClient.getResourcesByAgent(userId, req.params.agentId);
    res.json(resources);
  })
);

api.get(
  "/conversations/:conversationId/resources",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const resources = await cmsClient.getResourcesByConversation(userId, req.params.conversationId);
    res.json(resources);
  })
);

api.delete(
  "/resources/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    await cmsClient.deleteResource(userId, req.params.id);
    res.json({ success: true });
  })
);

// ===== VECTOR ROUTES =====

api.post(
  "/conversations/:conversationId/vectors",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const vectors = await cmsClient.addVectors(userId, req.params.conversationId, req.body.vectors);
    res.status(201).json(vectors);
  })
);

api.get(
  "/conversations/:conversationId/vectors",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const vectors = await cmsClient.getVectorsByConversation(userId, req.params.conversationId);
    res.json(vectors);
  })
);

export default api;
