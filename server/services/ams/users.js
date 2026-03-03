import { Router } from "express";
import { agentManagementService as service } from "./service.js";
import { routeHandler } from "../utils.js";

const router = Router();

router.post("/", routeHandler(async (req, res) => {
  res.status(201).json(await service.createUser(req.userId, req.body));
}));

router.get("/", routeHandler(async (req, res) => {
  res.json(await service.getUsers(req.userId, req.query));
}));

router.get("/:id", routeHandler(async (req, res) => {
  res.json(await service.getUser(req.userId, req.params.id));
}));

router.put("/:id", routeHandler(async (req, res) => {
  res.json(await service.updateUser(req.userId, req.params.id, req.body));
}));

router.delete("/:id", routeHandler(async (req, res) => {
  res.json(await service.deleteUser(req.userId, req.params.id));
}));

export default router;
