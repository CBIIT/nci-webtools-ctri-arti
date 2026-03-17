import { json, Router } from "express";

import { requireRole } from "../../auth.js";
import { createHttpError, getRequestContext } from "../utils.js";

export function createModelRouter({ modules } = {}) {
  if (!modules?.gateway) {
    throw new Error("gateway module is required");
  }

  const { gateway } = modules;
  const api = Router();
  api.use(json({ limit: 1024 ** 3 })); // 1GB

  api.post("/model", requireRole(), async (req, res, next) => {
    const context = getRequestContext(req);
    const ip = req.ip || req.socket.remoteAddress;

    try {
      const result = await gateway.invoke({
        userID: context.userId,
        requestId: context.requestId,
        ip,
        ...req.body,
      });

      if (result.status === 429) {
        return res.status(429).json({ error: result.error });
      }

      if (!result?.stream) {
        return res.json(result);
      }

      for await (const message of result.stream) {
        try {
          res.write(JSON.stringify(message) + "\n");
        } catch (error) {
          console.error("Error processing stream message:", error);
        }
      }

      res.end();
    } catch (error) {
      console.error("Error in model API:", error);
      next(createHttpError(500, error, "An error occurred while processing the model request"));
    }
  });

  api.get("/model/list", requireRole(), async (_req, res, next) => {
    try {
      const results = await gateway.listModels();
      res.json(results);
    } catch (error) {
      console.error("Error listing models:", error);
      next(createHttpError(500, error, "An error occurred while fetching models"));
    }
  });

  return api;
}

export default createModelRouter;
