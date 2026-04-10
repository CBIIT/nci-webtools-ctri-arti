import { createAgentsChatRouter } from "agents/http.js";
import { createCmsAgentsRouter, createCmsConversationsRouter } from "cms/http.js";
import { json, Router } from "express";
import { createGatewayModelRouter } from "gateway/http.js";
import { JSON_BODY_LIMIT } from "shared/http-limits.js";
import { logRequests } from "shared/middleware.js";
import { readHttpRequestContext } from "shared/request-context.js";

import { requireRole } from "../auth.js";

import { logErrors } from "./middleware.js";
import { createAdminRouter } from "./routes/admin.js";
import { createAuthRouter } from "./routes/auth.js";
import { createToolsRouter } from "./routes/tools.js";

const PUBLIC_ROUTES = new Set(["/config", "/login", "/logout", "/session", "/status"]);

export function createServerApi({ modules } = {}) {
  if (!modules) {
    throw new Error("server modules are required");
  }

  const api = Router();

  api.use(json({ limit: JSON_BODY_LIMIT }));
  api.use(logRequests());
  api.use((req, res, next) => {
    const isOauthRoute = req.path === "/oauth" || req.path.startsWith("/oauth/");
    if (PUBLIC_ROUTES.has(req.path) || isOauthRoute) {
      return next();
    }
    return requireRole()(req, res, next);
  });
  api.use(createAdminRouter({ modules }));
  api.use(
    createAgentsChatRouter({
      application: modules.agents,
    })
  );
  api.use(
    createCmsAgentsRouter({
      application: modules.cms,
      resolveContext(req) {
        return readHttpRequestContext(req, { source: "server" });
      },
    })
  );
  api.use(createAuthRouter({ modules }));
  api.use(
    createCmsConversationsRouter({
      application: modules.cms,
      resolveContext(req) {
        return readHttpRequestContext(req, { source: "server" });
      },
    })
  );
  api.use(
    createGatewayModelRouter({
      application: modules.gateway,
      resolveInvokeInput(req) {
        const { userId, requestId } = readHttpRequestContext(req, { source: "server" });
        return {
          ...req.body,
          userId,
          requestId,
        };
      },
    })
  );
  api.use(createToolsRouter({ modules }));
  api.use(logErrors());

  return api;
}
