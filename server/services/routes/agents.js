import { Router } from "express";

import { requireRole } from "../../auth.js";
import { createAgent, deleteAgent, getAgent, getAgents, updateAgent } from "../../cms.js";
import { getRequestContext, routeHandler } from "../utils.js";

const api = Router();

api.post(
  "/agents",
  requireRole(),
  routeHandler(async (req, res) => {
    const context = getRequestContext(req);
    const agent = await createAgent(context, req.body);
    res.status(201).json(agent);
  })
);

api.get(
  "/agents",
  requireRole(),
  routeHandler(async (req, res) => {
    const context = getRequestContext(req);
    const agents = await getAgents(context);
    res.json(agents);
  })
);

api.get(
  "/agents/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const context = getRequestContext(req);
    const agent = await getAgent(context, req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  })
);

api.put(
  "/agents/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const context = getRequestContext(req);
    const agent = await updateAgent(context, req.params.id, req.body);
    res.json(agent);
  })
);

api.delete(
  "/agents/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const context = getRequestContext(req);
    await deleteAgent(context, req.params.id);
    res.json({ success: true });
  })
);

export default api;
