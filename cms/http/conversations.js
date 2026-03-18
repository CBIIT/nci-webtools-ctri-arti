import { json, Router } from "express";

import {
  JSON_UPLOAD_LIMIT,
  parsePageQuery,
  readRequestContext,
  sendNotFound,
  sendResourceDownload,
  streamResponse,
  withResolvedContext,
} from "./helpers.js";

export function createCmsConversationsRouter({
  application,
  resolveContext = readRequestContext,
  downloadPath = null,
} = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const api = Router();
  api.use(json({ limit: JSON_UPLOAD_LIMIT }));

  api.post(
    "/conversations",
    withResolvedContext(resolveContext, async (req, res) => {
      const conversation = await application.createConversation(req.context, req.body);
      res.status(201).json(conversation);
    })
  );

  api.get(
    "/conversations",
    withResolvedContext(resolveContext, async (req, res) => {
      const conversations = await application.getConversations(req.context, parsePageQuery(req.query));
      res.json(conversations);
    })
  );

  api.get(
    "/conversations/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const conversation = await application.getConversation(req.context, req.params.id);
      if (!conversation) return sendNotFound(res, "Conversation");
      res.json(conversation);
    })
  );

  api.put(
    "/conversations/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const conversation = await application.updateConversation(req.context, req.params.id, req.body);
      if (!conversation) return sendNotFound(res, "Conversation");
      res.json(conversation);
    })
  );

  api.delete(
    "/conversations/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      await application.deleteConversation(req.context, req.params.id);
      res.json({ success: true });
    })
  );

  api.get(
    "/conversations/:id/context",
    withResolvedContext(resolveContext, async (req, res) => {
      const conversationContext = await application.getContext(req.context, req.params.id, {
        compressed: req.query.compressed === "true",
      });
      if (!conversationContext) return sendNotFound(res, "Conversation");
      res.json(conversationContext);
    })
  );

  api.post(
    "/conversations/:id/summarize",
    withResolvedContext(resolveContext, async (req, res) => {
      await streamResponse(res, application.summarize(req.context, req.params.id, req.body));
    })
  );

  api.post(
    "/summarize",
    withResolvedContext(resolveContext, async (req, res) => {
      const { conversationId, ...params } = req.body;
      await streamResponse(res, application.summarize(req.context, conversationId, params));
    })
  );

  api.post(
    "/conversations/:conversationId/messages",
    withResolvedContext(resolveContext, async (req, res) => {
      const message = await application.appendConversationMessage(req.context, {
        conversationId: Number(req.params.conversationId),
        ...req.body,
      });
      res.status(201).json(message);
    })
  );

  api.get(
    "/conversations/:conversationId/messages",
    withResolvedContext(resolveContext, async (req, res) => {
      const messages = await application.getMessages(req.context, req.params.conversationId);
      res.json(messages);
    })
  );

  api.get(
    "/messages/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const message = await application.getMessage(req.context, req.params.id);
      if (!message) return sendNotFound(res, "Message");
      res.json(message);
    })
  );

  api.put(
    "/messages/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const message = await application.updateMessage(req.context, req.params.id, req.body);
      if (!message) return sendNotFound(res, "Message");
      res.json(message);
    })
  );

  api.delete(
    "/messages/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      await application.deleteMessage(req.context, req.params.id);
      res.json({ success: true });
    })
  );

  api.post(
    "/resources",
    withResolvedContext(resolveContext, async (req, res) => {
      const resource = await application.storeConversationResource(req.context, req.body);
      res.status(201).json(resource);
    })
  );

  api.get(
    "/resources/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const resource = await application.getResource(req.context, req.params.id);
      if (!resource) return sendNotFound(res, "Resource");
      res.json(resource);
    })
  );

  if (downloadPath) {
    api.get(
      downloadPath,
      withResolvedContext(resolveContext, async (req, res) => {
        const resource = await application.getResource(req.context, req.params.id);
        if (!resource) return sendNotFound(res, "Resource");
        sendResourceDownload(res, resource);
      })
    );
  }

  api.put(
    "/resources/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const resource = await application.updateConversationResource(
        req.context,
        req.params.id,
        req.body
      );
      if (!resource) return sendNotFound(res, "Resource");
      res.json(resource);
    })
  );

  api.get(
    "/agents/:agentId/resources",
    withResolvedContext(resolveContext, async (req, res) => {
      const resources = await application.getResourcesByAgent(req.context, req.params.agentId);
      res.json(resources);
    })
  );

  api.get(
    "/conversations/:conversationId/resources",
    withResolvedContext(resolveContext, async (req, res) => {
      const resources = await application.getResourcesByConversation(
        req.context,
        req.params.conversationId
      );
      res.json(resources);
    })
  );

  api.delete(
    "/resources/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      await application.deleteConversationResource(req.context, req.params.id);
      res.json({ success: true });
    })
  );

  api.post(
    "/conversations/:conversationId/vectors",
    withResolvedContext(resolveContext, async (req, res) => {
      const vectors = await application.storeConversationVectors(req.context, {
        conversationId: Number(req.params.conversationId),
        vectors: req.body.vectors,
      });
      res.status(201).json(vectors);
    })
  );

  api.get(
    "/conversations/:conversationId/vectors",
    withResolvedContext(resolveContext, async (req, res) => {
      const vectors = await application.getVectorsByConversation(req.context, req.params.conversationId);
      res.json(vectors);
    })
  );

  return api;
}


