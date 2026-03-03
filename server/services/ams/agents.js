import { Router } from "express";
import { agentManagementService as service } from "./service.js";
import { routeHandler } from "../utils.js";

const router = Router();

router.post("/", routeHandler(async (req, res) => {
  res.status(201).json(await service.createAgent(req.userId, req.body));
}));

router.get("/", routeHandler(async (req, res) => {
  res.json(await service.getAgents(req.userId));
}));

router.get("/:id", routeHandler(async (req, res) => {
  res.json(await service.getAgent(req.userId, req.params.id));
}));

router.put("/:id", routeHandler(async (req, res) => {
  res.json(await service.updateAgent(req.userId, req.params.id, req.body));
}));

router.delete("/:id", routeHandler(async (req, res) => {
  res.json(await service.deleteAgent(req.userId, req.params.id));
}));

export default router;
