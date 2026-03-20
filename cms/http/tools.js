import { Router } from "express";

import { readRequestContext, sendNotFound, withResolvedContext } from "./helpers.js";

export function createCmsToolsRouter({ application, resolveContext = readRequestContext } = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const api = Router();

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
        if (!tool) return sendNotFound(res, "Tool");
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
        if (!tool) return sendNotFound(res, "Tool");
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
        const prompts = await application.getPrompts();
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
        if (!prompt) return sendNotFound(res, "Prompt");
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
        if (!prompt) return sendNotFound(res, "Prompt");
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

  return api;
}

