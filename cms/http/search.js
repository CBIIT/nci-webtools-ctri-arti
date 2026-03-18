import { json, Router } from "express";

import {
  JSON_UPLOAD_LIMIT,
  parseEmbeddingQuery,
  readRequestContext,
  withResolvedContext,
} from "./helpers.js";

export function createCmsSearchRouter({ application, resolveContext = readRequestContext } = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const api = Router();
  api.use(json({ limit: JSON_UPLOAD_LIMIT }));

  api.post(
    "/vectors",
    withResolvedContext(resolveContext, async (req, res) => {
      const vectors = await application.storeConversationVectors(req.context, {
        ...req.body,
        conversationId: req.body?.conversationId ?? req.body?.conversationID,
      });
      res.status(201).json(vectors);
    })
  );

  api.get(
    "/resources/:resourceId/vectors",
    withResolvedContext(resolveContext, async (req, res) => {
      const vectors = await application.getVectorsByResource(req.context, req.params.resourceId);
      res.json(vectors);
    })
  );

  api.get(
    "/vectors/search",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const vectors = await application.searchVectors({
          toolID: req.query.toolID ? Number(req.query.toolID) : undefined,
          conversationID: req.query.conversationID ? Number(req.query.conversationID) : undefined,
          embedding: parseEmbeddingQuery(req.query.embedding),
          topN: req.query.topN ? Number(req.query.topN) : undefined,
        });
        res.json(vectors);
      },
      { required: false }
    )
  );

  api.delete(
    "/resources/:resourceId/vectors",
    withResolvedContext(resolveContext, async (req, res) => {
      await application.deleteVectorsByResource(req.context, req.params.resourceId);
      res.json({ success: true });
    })
  );

  api.delete(
    "/conversations/:conversationId/vectors",
    withResolvedContext(resolveContext, async (req, res) => {
      await application.deleteVectorsByConversation(req.context, req.params.conversationId);
      res.json({ success: true });
    })
  );

  api.post(
    "/search/messages",
    withResolvedContext(resolveContext, async (req, res) => {
      const results = await application.searchMessages(req.context, req.body);
      res.json(results);
    })
  );

  api.post(
    "/search/vectors",
    withResolvedContext(resolveContext, async (req, res) => {
      const results = await application.searchResourceVectors(req.context, req.body);
      res.json(results);
    })
  );

  api.post(
    "/search/chunks",
    withResolvedContext(resolveContext, async (req, res) => {
      const results = await application.searchChunks(req.context, req.body);
      res.json(results);
    })
  );

  return api;
}


