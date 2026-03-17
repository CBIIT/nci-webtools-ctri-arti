import { json, Router } from "express";

import { requireRole } from "../../auth.js";
import { getRequestContext, routeHandler } from "../utils.js";

const JSON_UPLOAD_LIMIT = 1024 ** 3;
const TEXT_DOWNLOAD_FORMATS = new Set(["txt", "md", "html", "htm", "csv", "json", "xml"]);
const RESOURCE_MIME_TYPES = {
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

function getResourceFormat(resource) {
  return (resource?.metadata?.format || resource?.name?.split(".").pop() || "").toLowerCase();
}

function getMimeTypeFromResource(resource) {
  const format = getResourceFormat(resource);

  if (resource?.metadata?.encoding === "base64") {
    return RESOURCE_MIME_TYPES[format] || "application/octet-stream";
  }

  if (TEXT_DOWNLOAD_FORMATS.has(format)) {
    return RESOURCE_MIME_TYPES[format];
  }

  return "text/plain; charset=utf-8";
}

function getDownloadFilename(resource) {
  const name = resource?.name || `resource-${resource?.id || "download"}`;
  const format = getResourceFormat(resource) || name.split(".").pop()?.toLowerCase() || "";

  if (resource?.metadata?.encoding === "base64" || TEXT_DOWNLOAD_FORMATS.has(format)) {
    return name;
  }

  return name.endsWith(".txt") ? name : `${name}.txt`;
}

function sendNotFound(res, label) {
  return res.status(404).json({ error: `${label} not found` });
}

function parsePageQuery(query = {}) {
  return {
    limit: parseInt(query.limit, 10) || 20,
    offset: parseInt(query.offset, 10) || 0,
  };
}

function sendResourceDownload(res, resource) {
  const filename = getDownloadFilename(resource);
  const contentType = getMimeTypeFromResource(resource);
  const content =
    resource?.metadata?.encoding === "base64"
      ? Buffer.from(resource.content || "", "base64")
      : Buffer.from(resource.content || "", "utf-8");

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(content);
}

export function createConversationsRouter({ modules } = {}) {
  if (!modules?.cms) {
    throw new Error("cms module is required");
  }

  const { cms } = modules;
  const api = Router();
  api.use(json({ limit: JSON_UPLOAD_LIMIT })); // 1GB for file uploads

  function withContext(handler) {
    return routeHandler(async (req, res, next) => {
      const context = getRequestContext(req);
      return handler({ req, res, next, context });
    });
  }

  api.post(
    "/conversations",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const conversation = await cms.createConversation(context, req.body);
      res.status(201).json(conversation);
    })
  );

  api.get(
    "/conversations",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const result = await cms.getConversations(context, parsePageQuery(req.query));
      res.json(result);
    })
  );

  api.get(
    "/conversations/:id",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const conversation = await cms.getConversation(context, req.params.id);
      if (!conversation) return sendNotFound(res, "Conversation");
      res.json(conversation);
    })
  );

  api.put(
    "/conversations/:id",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const conversation = await cms.updateConversation(context, req.params.id, req.body);
      if (!conversation) return sendNotFound(res, "Conversation");
      res.json(conversation);
    })
  );

  api.delete(
    "/conversations/:id",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      await cms.deleteConversation(context, req.params.id);
      res.json({ success: true });
    })
  );

  api.get(
    "/conversations/:id/context",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const compressed = req.query.compressed === "true";
      const conversationContext = await cms.getContext(context, req.params.id, { compressed });
      if (!conversationContext) return sendNotFound(res, "Conversation");
      res.json(conversationContext);
    })
  );

  api.post(
    "/conversations/:conversationId/messages",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const message = await cms.appendConversationMessage(context, {
        conversationId: Number(req.params.conversationId),
        ...req.body,
      });
      res.status(201).json(message);
    })
  );

  api.get(
    "/conversations/:conversationId/messages",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const messages = await cms.getMessages(context, req.params.conversationId);
      res.json(messages);
    })
  );

  api.put(
    "/messages/:id",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const message = await cms.updateMessage(context, req.params.id, req.body);
      if (!message) return sendNotFound(res, "Message");
      res.json(message);
    })
  );

  api.delete(
    "/messages/:id",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      await cms.deleteMessage(context, req.params.id);
      res.json({ success: true });
    })
  );

  api.post(
    "/resources",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const resource = await cms.storeConversationResource(context, req.body);
      res.status(201).json(resource);
    })
  );

  api.get(
    "/resources/:id",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const resource = await cms.getResource(context, req.params.id);
      if (!resource) return sendNotFound(res, "Resource");
      res.json(resource);
    })
  );

  api.get(
    "/resources/:id/download",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const resource = await cms.getResource(context, req.params.id);
      if (!resource) return sendNotFound(res, "Resource");
      sendResourceDownload(res, resource);
    })
  );

  api.put(
    "/resources/:id",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const resource = await cms.updateConversationResource(context, req.params.id, req.body);
      if (!resource) return sendNotFound(res, "Resource");
      res.json(resource);
    })
  );

  api.get(
    "/agents/:agentId/resources",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const resources = await cms.getResourcesByAgent(context, req.params.agentId);
      res.json(resources);
    })
  );

  api.get(
    "/conversations/:conversationId/resources",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const resources = await cms.getResourcesByConversation(context, req.params.conversationId);
      res.json(resources);
    })
  );

  api.delete(
    "/resources/:id",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      await cms.deleteConversationResource(context, req.params.id);
      res.json({ success: true });
    })
  );

  api.post(
    "/conversations/:conversationId/vectors",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const vectors = await cms.storeConversationVectors(context, {
        conversationId: Number(req.params.conversationId),
        vectors: req.body.vectors,
      });
      res.status(201).json(vectors);
    })
  );

  api.get(
    "/conversations/:conversationId/vectors",
    requireRole(),
    withContext(async ({ req, res, context }) => {
      const vectors = await cms.getVectorsByConversation(context, req.params.conversationId);
      res.json(vectors);
    })
  );

  return api;
}

export default createConversationsRouter;
