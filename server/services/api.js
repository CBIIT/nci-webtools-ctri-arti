import { createAgentsChatRouter } from "agents/http.js";
import { createCmsAgentsRouter, createCmsConversationsRouter } from "cms/http.js";
import { json, Router } from "express";
import { createGatewayModelRouter } from "gateway/http.js";
import { logRequests } from "shared/middleware.js";

import { requireRole } from "../auth.js";

import { logErrors } from "./middleware.js";
import { createAdminRouter } from "./routes/admin.js";
import { createAuthRouter } from "./routes/auth.js";
import { createToolsRouter } from "./routes/tools.js";
import { createHttpError, getRequestContext } from "./utils.js";

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
  api.use(
    createAgentsChatRouter({
      application: modules.agents,
      routePath: "/agents/:agentId/conversations/:conversationId/chat",
    })
  );
  api.use(
    createCmsAgentsRouter({
      application: modules.cms,
      resolveContext(req) {
        return getRequestContext(req);
      },
    })
  );
  api.use(createAuthRouter({ modules }));
  api.use(
    createCmsConversationsRouter({
      application: modules.cms,
      resolveContext(req) {
        return getRequestContext(req);
      },
      downloadPath: "/resources/:id/download",
    })
  );
  api.use(
    createGatewayModelRouter({
      application: modules.gateway,
      invokePath: "/model",
      listPath: "/model/list",
      resolveInvokeInput(req) {
        const context = getRequestContext(req);
        const ip = req.ip || req.socket.remoteAddress;
        return {
          userID: context.userId,
          requestId: context.requestId,
          ip,
          ...req.body,
        };
      },
      includeRateLimitCode: false,
      createUnexpectedError(error, operation) {
        if (operation === "gateway list models") {
          return createHttpError(500, error, "An error occurred while fetching models");
        }
        return createHttpError(500, error, "An error occurred while processing the model request");
      },
    })
  );
  api.use(createToolsRouter({ modules }));
  api.use(logErrors());

  return api;
}

export default createServerApi;
