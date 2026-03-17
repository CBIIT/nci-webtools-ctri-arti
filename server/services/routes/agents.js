import { Router } from "express";

import { requireRole } from "../../auth.js";
import { getRequestContext, routeHandler } from "../utils.js";

export function createAgentsRouter({ modules } = {}) {
  if (!modules?.cms) {
    throw new Error("cms module is required");
  }

  const { cms } = modules;
  const api = Router();

  api.post(
    "/agents",
    requireRole(),
    routeHandler(async (req, res) => {
      const context = getRequestContext(req);
      const agent = await cms.createAgent(context, req.body);
      res.status(201).json(agent);
    })
  );

  api.get(
    "/agents",
    requireRole(),
    routeHandler(async (req, res) => {
      const context = getRequestContext(req);
      const agents = await cms.getAgents(context);
      res.json(agents);
    })
  );

  api.get(
    "/agents/:id",
    requireRole(),
    routeHandler(async (req, res) => {
      const context = getRequestContext(req);
      const agent = await cms.getAgent(context, req.params.id);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      res.json(agent);
    })
  );

  api.put(
    "/agents/:id",
    requireRole(),
    routeHandler(async (req, res) => {
      const context = getRequestContext(req);
      const agent = await cms.updateAgent(context, req.params.id, req.body);
      res.json(agent);
    })
  );

  api.delete(
    "/agents/:id",
    requireRole(),
    routeHandler(async (req, res) => {
      const context = getRequestContext(req);
      await cms.deleteAgent(context, req.params.id);
      res.json({ success: true });
    })
  );

  return api;
}

export default createAgentsRouter;
