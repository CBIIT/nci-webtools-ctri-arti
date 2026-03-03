import { Router } from "express";
import { agentManagementService as service } from "./service.js";
import { routeHandler } from "../utils.js";

const router = Router();

router.get("/", routeHandler(async (req, res) => {
  res.json(await service.getModels(req.userId, req.query));
}));

router.get("/:id", routeHandler(async (req, res) => {
  res.json(await service.getModel(req.userId, req.params.id));
}));

export default router;
