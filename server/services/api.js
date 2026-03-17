import { json, Router } from "express";
import { logRequests } from "shared/middleware.js";

import { requireRole } from "../auth.js";

import { logErrors } from "./middleware.js";
import { createAdminRouter } from "./routes/admin.js";
import { createAgentsChatRouter } from "./routes/agents-chat.js";
import { createAgentsRouter } from "./routes/agents.js";
import { createAuthRouter } from "./routes/auth.js";
import { createConversationsRouter } from "./routes/conversations.js";
import { createModelRouter } from "./routes/model.js";
import { createToolsRouter } from "./routes/tools.js";

const PUBLIC_ROUTES = new Set(["/config", "/login", "/logout", "/session", "/status"]);

export function createServerApi({ modules } = {}) {
  if (!modules) {
    throw new Error("server modules are required");
  }

  const api = Router();

  api.use(json({ limit: 1024 ** 3 })); // 1GB
  api.use(logRequests());
  api.use((req, res, next) => {
    const isOauthRoute = req.path === "/oauth" || req.path.startsWith("/oauth/");
    if (PUBLIC_ROUTES.has(req.path) || isOauthRoute) {
      return next();
    }
    return requireRole()(req, res, next);
  });
  api.use(createAdminRouter({ modules }));
  api.use(createAgentsChatRouter({ modules }));
  api.use(createAgentsRouter({ modules }));
  api.use(createAuthRouter({ modules }));
  api.use(createConversationsRouter({ modules }));
  api.use(createModelRouter({ modules }));
  api.use(createToolsRouter({ modules }));
  api.use(logErrors());

  return api;
}

export default createServerApi;
