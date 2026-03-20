import { Router } from "express";

import {
  parseEmbeddingQuery,
  readRequestContext,
  withResolvedContext,
} from "./helpers.js";

function readOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function normalizeVectorSearchInput(query = {}) {
  return {
    toolId: readOptionalNumber(query.toolId),
    conversationId: readOptionalNumber(query.conversationId),
    embedding: parseEmbeddingQuery(query.embedding),
    topN: readOptionalNumber(query.topN),
  };
}

export function createCmsSearchRouter({ application, resolveContext = readRequestContext } = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const api = Router();

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
        const vectors = await application.searchVectors(normalizeVectorSearchInput(req.query));
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
