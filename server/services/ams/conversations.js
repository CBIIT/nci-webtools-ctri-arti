import { Router } from "express";
import { agentManagementService as service } from "./service.js";
import { routeHandler } from "../utils.js";

const router = Router();

router.post("/", routeHandler(async (req, res) => {
  res.status(201).json(await service.createConversation(req.userId, req.body));
}));

router.get("/", routeHandler(async (req, res) => {
  res.json(await service.getConversations(req.userId));
}));

router.get("/:id", routeHandler(async (req, res) => {
  res.json(await service.getConversation(req.userId, req.params.id));
}));

router.put("/:id", routeHandler(async (req, res) => {
  const result = await service.chat(req.userId, req.params.id, req.body);
  if (req.body.stream) {
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Transfer-Encoding", "chunked");
    const reader = result.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } else {
    res.json(result);
  }
}));

router.delete("/:id", routeHandler(async (req, res) => {
  res.json(await service.deleteConversation(req.userId, req.params.id));
}));

export default router;
