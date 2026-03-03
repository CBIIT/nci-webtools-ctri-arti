import { Router } from "express";
import { agentManagementService as service } from "./service.js";
import { routeHandler } from "../utils.js";

const router = Router();

router.get("/", routeHandler(async (req, res) => {
  res.json(await service.getUsages(req.userId, req.query));
}));

export default router;
