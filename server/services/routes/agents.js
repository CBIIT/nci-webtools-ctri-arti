import { Router } from "express";
import { cmsClient } from "shared/clients/cms.js";
import { requireRole } from "users/middleware.js";

import { getUserId, routeHandler } from "../utils.js";

const api = Router();

api.post(
  "/agents",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const agent = await cmsClient.createAgent(userId, req.body);
    res.status(201).json(agent);
  })
);

api.get(
  "/agents",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const agents = await cmsClient.getAgents(userId);
    res.json(agents);
  })
);

api.get(
  "/agents/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const agent = await cmsClient.getAgent(userId, req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  })
);

api.put(
  "/agents/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    const existingAgent = await cmsClient.getAgent(userId, req.params.id);
    if (!existingAgent) return res.status(404).json({ error: "Agent not found" });
    if (existingAgent.userID === null) {
      return res.status(403).json({ error: "Cannot modify global agent" });
    }
    const agent = await cmsClient.updateAgent(userId, req.params.id, req.body);
    res.json(agent);
  })
);

api.delete(
  "/agents/:id",
  requireRole(),
  routeHandler(async (req, res) => {
    const userId = getUserId(req);
    await cmsClient.deleteAgent(userId, req.params.id);
    res.json({ success: true });
  })
);

export default api;
