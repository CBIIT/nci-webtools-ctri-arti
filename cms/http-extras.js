import { json, Router } from "express";

import {
  JSON_UPLOAD_LIMIT,
  parseEmbeddingQuery,
  readRequestContext,
  streamResponse,
  withResolvedContext,
} from "./http-helpers.js";

export function createCmsExtrasRouter({ application, resolveContext = readRequestContext } = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const api = Router();
  api.use(json({ limit: JSON_UPLOAD_LIMIT }));

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

  api.get(
    "/messages/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const message = await application.getMessage(req.context, req.params.id);
      if (!message) return res.status(404).json({ error: "Message not found" });
      res.json(message);
    })
  );

  api.post(
    "/tools",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const tool = await application.createTool(req.body);
        res.status(201).json(tool);
      },
      { required: false }
    )
  );

  api.get(
    "/tools",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const tools = await application.getTools(req.context);
        res.json(tools);
      },
      { required: false }
    )
  );

  api.get(
    "/tools/:id",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const tool = await application.getTool(req.params.id);
        if (!tool) return res.status(404).json({ error: "Tool not found" });
        res.json(tool);
      },
      { required: false }
    )
  );

  api.put(
    "/tools/:id",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const tool = await application.updateTool(req.params.id, req.body);
        if (!tool) return res.status(404).json({ error: "Tool not found" });
        res.json(tool);
      },
      { required: false }
    )
  );

  api.delete(
    "/tools/:id",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        await application.deleteTool(req.params.id);
        res.json({ success: true });
      },
      { required: false }
    )
  );

  api.post(
    "/prompts",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const prompt = await application.createPrompt(req.body);
        res.status(201).json(prompt);
      },
      { required: false }
    )
  );

  api.get(
    "/prompts",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const prompts = await application.getPrompts(req.query);
        res.json(prompts);
      },
      { required: false }
    )
  );

  api.get(
    "/prompts/:id",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const prompt = await application.getPrompt(req.params.id);
        if (!prompt) return res.status(404).json({ error: "Prompt not found" });
        res.json(prompt);
      },
      { required: false }
    )
  );

  api.put(
    "/prompts/:id",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        const prompt = await application.updatePrompt(req.params.id, req.body);
        if (!prompt) return res.status(404).json({ error: "Prompt not found" });
        res.json(prompt);
      },
      { required: false }
    )
  );

  api.delete(
    "/prompts/:id",
    withResolvedContext(
      resolveContext,
      async (req, res) => {
        await application.deletePrompt(req.params.id);
        res.json({ success: true });
      },
      { required: false }
    )
  );

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
