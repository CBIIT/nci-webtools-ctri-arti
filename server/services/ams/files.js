import { Router } from "express";
import multer from "multer";
import { agentManagementService as service } from "./service.js";
import { routeHandler } from "../utils.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("content"), routeHandler(async (req, res) => {
  const filename = req.body.filename || req.file?.originalname;
  res.status(201).json(await service.uploadFile(req.userId, req.file, filename));
}));

router.get("/", routeHandler(async (req, res) => {
  res.json(await service.getFiles(req.userId));
}));

router.delete("/", routeHandler(async (req, res) => {
  res.json(await service.deleteFile(req.userId, req.body.filename));
}));

export default router;
