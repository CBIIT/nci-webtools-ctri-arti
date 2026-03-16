import { json, Router } from "express";
import { logRequests } from "shared/middleware.js";
import { requireRole } from "users/middleware.js";

import { logErrors } from "./middleware.js";
import adminRoutes from "./routes/admin.js";
import agentsChatRoutes from "./routes/agents-chat.js";
import agentRoutes from "./routes/agents.js";
import authRoutes from "./routes/auth.js";
import conversationRoutes from "./routes/conversations.js";
import modelRoutes from "./routes/model.js";
import toolRoutes from "./routes/tools.js";

const api = Router();
const PUBLIC_ROUTES = new Set(["/config", "/login", "/logout", "/session", "/status"]);

api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(logRequests());
api.use((req, res, next) => {
  const isOauthRoute = req.path === "/oauth" || req.path.startsWith("/oauth/");
  if (PUBLIC_ROUTES.has(req.path) || isOauthRoute) {
    return next();
  }
  return requireRole()(req, res, next);
});
api.use(adminRoutes);
api.use(agentsChatRoutes);
api.use(agentRoutes);
api.use(authRoutes);
api.use(conversationRoutes);
api.use(modelRoutes);
api.use(toolRoutes);
api.use(logErrors());

export default api;
