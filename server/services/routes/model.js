import { json, Router } from "express";

import { invoke, listModels } from "../clients/gateway.js";
import { requireRole } from "../middleware.js";
import { createHttpError } from "../utils.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

api.post("/model", requireRole(), async (req, res, next) => {
  const user = req.session.user;
  const ip = req.ip || req.socket.remoteAddress;

  try {
    const result = await invoke({
      userID: user.id,
      ip,
      ...req.body,
    });

    // Handle rate limit error
    if (result.status === 429) {
      return res.status(429).json({ error: result.error });
    }

    // For non-streaming responses
    if (!result?.stream) {
      return res.json(result);
    }

    // For streaming responses
    for await (const message of result.stream) {
      try {
        res.write(JSON.stringify(message) + "\n");
      } catch (err) {
        console.error("Error processing stream message:", err);
      }
    }

    res.end();
  } catch (error) {
    console.error("Error in model API:", error);
    next(createHttpError(500, error, "An error occurred while processing the model request"));
  }
});

api.get("/model/list", requireRole(), async (req, res, next) => {
  try {
    const results = await listModels();
    res.json(results);
  } catch (error) {
    console.error("Error listing models:", error);
    next(createHttpError(500, error, "An error occurred while fetching models"));
  }
});

export default api;
