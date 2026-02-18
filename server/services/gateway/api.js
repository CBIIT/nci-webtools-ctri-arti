import { json, Router } from "express";
import { logErrors, logRequests } from "../middleware.js";
import { Model } from "../database.js";
import chatRoutes from "./chat.js";
import embeddingsRoutes from "./embeddings.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());
api.use("/v1", chatRoutes);
api.use("/v1", embeddingsRoutes);

/**
 * GET /api/models - List available models
 */
api.get("/models", async (req, res) => {
  const results = await Model.findAll({
    attributes: ["name", "internalName", "maxContext", "maxOutput", "maxReasoning"],
    where: { providerId: 1 },
  });
  res.json(results);
});

api.use(logErrors());

export default api;
