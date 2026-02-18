import { json, Router } from "express";

import { infer } from "../clients/gateway.js";
import { Model, Provider } from "../database.js";
import { requireRole } from "../middleware.js";
import { createHttpError } from "../utils.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

api.post("/model", requireRole(), async (req, res, next) => {
  const user = req.session.user;
  const ip = req.ip || req.socket.remoteAddress;

  try {
    const result = await infer({
      userId: user.id,
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
    let aborted = false;
    req.on("close", () => {
      if (!res.writableEnded) {
        aborted = true;
      }
    });

    for await (const message of result.stream) {
      if (!aborted) {
        try {
          res.write(JSON.stringify(message) + "\n");
        } catch (err) {
          console.error("Error processing stream message:", err);
        }
      }
      // Continue iterating even if aborted so the gateway wrapper
      // reaches the metadata event and tracks usage
    }

    if (!aborted) {
      res.end();
    }
  } catch (error) {
    console.error("Error in model API:", error);
    next(createHttpError(500, error, "An error occurred while processing the model request"));
  }
});

api.get("/model/list", requireRole(), async (req, res, next) => {
  try {
    const results = await Model.findAll({
      attributes: ["id", "name", "description", "internalName", "maxContext", "maxOutput", "maxReasoning"],
      include: [{ model: Provider, attributes: ["name"] }],
    });
    const models = results
      .map((m) => ({
        ...m.toJSON(),
        value: m.internalName,
        label: `${m.name} (${m.Provider?.name || "unknown"})`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(models);
  } catch (error) {
    console.error("Error listing models:", error);
    next(createHttpError(500, error, "An error occurred while fetching models"));
  }
});

export default api;
