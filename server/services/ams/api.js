import { json, Router } from "express";
import { logErrors, logRequests } from "../middleware.js";
import agentRoutes from "./agents.js";
import modelRoutes from "./models.js";
import toolRoutes from "./tools.js";
import conversationRoutes from "./conversations.js";
import userRoutes from "./users.js";
import usageRoutes from "./usages.js";
import fileRoutes from "./files.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 }));
api.use(logRequests());

// Extract userId from header (internal service communication)
api.use((req, res, next) => {
  req.userId = req.headers["x-user-id"];
  if (!req.userId) {
    return res.status(400).json({ error: "X-User-Id header required" });
  }
  next();
});

// Mount sub-routers under /v1
api.use("/v1/agents", agentRoutes);
api.use("/v1/models", modelRoutes);
api.use("/v1/tools", toolRoutes);
api.use("/v1/conversations", conversationRoutes);
api.use("/v1/users", userRoutes);
api.use("/v1/usages", usageRoutes);
api.use("/v1/files", fileRoutes);

api.use(logErrors());

export default api;
