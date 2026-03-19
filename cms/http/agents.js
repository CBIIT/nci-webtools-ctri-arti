import { json, Router } from "express";

import { JSON_UPLOAD_LIMIT, readRequestContext, withResolvedContext } from "./helpers.js";

export function createCmsAgentsRouter({ application, resolveContext = readRequestContext } = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const api = Router();
  api.use(json({ limit: JSON_UPLOAD_LIMIT }));

  api.post(
    "/agents",
    withResolvedContext(resolveContext, async (req, res) => {
      const agent = await application.createAgent(req.context, req.body);
      res.status(201).json(agent);
    })
  );

  api.get(
    "/agents",
    withResolvedContext(resolveContext, async (req, res) => {
      const agents = await application.getAgents(req.context);
      res.json(agents);
    })
  );

  api.get(
    "/agents/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const agent = await application.getAgent(req.context, req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      res.json(agent);
    })
  );

  api.put(
    "/agents/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      const agent = await application.updateAgent(req.context, req.params.id, req.body);
      res.json(agent);
    })
  );

  api.delete(
    "/agents/:id",
    withResolvedContext(resolveContext, async (req, res) => {
      await application.deleteAgent(req.context, req.params.id);
      res.json({ success: true });
    })
  );

  return api;
}
