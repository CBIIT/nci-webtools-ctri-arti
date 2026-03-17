import { json, Router } from "express";
import { createAnonymousRequestContext } from "shared/request-context.js";

import { loginMiddleware, oauthMiddleware } from "../middleware.js";

const { OAUTH_PROVIDER_ENABLED } = process.env;

export function createAuthRouter({ modules } = {}) {
  if (!modules?.cms || !modules?.users) {
    throw new Error("cms and users modules are required");
  }

  const { cms, users } = modules;
  const api = Router();
  api.use(json({ limit: 1024 ** 3 })); // 1GB

  if (OAUTH_PROVIDER_ENABLED?.toLowerCase() === "true") {
    api.use("/oauth", oauthMiddleware());
  }

  api.get("/login", loginMiddleware, async (req, res) => {
    const { session } = req;
    const { email, first_name: firstName, last_name: lastName } = session.userinfo;
    if (!email) return res.redirect("/?error=missing_email");
    session.user = await users.findOrCreateUser({ email, firstName, lastName });
    res.redirect(session.destination || "/");
  });

  api.get("/logout", (req, res) => {
    const destination = req.query.destination || "/";
    req.session.destroy(() => res.redirect(destination));
  });

  api.all("/session", async (req, res) => {
    const { session } = req;
    const apiKey = req.headers["x-api-key"];
    if (req.method === "POST") {
      session.touch();
      session.expires = session.cookie.expires;
    }

    let user = await users.resolveIdentity({
      sessionUserId: session.user?.id,
      apiKey,
    });

    if (!user && !session.user?.id && !apiKey) {
      user = session.user || null;
    }

    if (user && apiKey && !session.user?.id) {
      session.user = user;
    }

    res.json({ user, expires: session.cookie.expires });
  });

  api.get("/config", async (_req, res) => {
    const anonymousContext = createAnonymousRequestContext({ source: "server" });
    const [usersConfig, agentList] = await Promise.all([
      users.getConfig(),
      cms
        .getAgents(anonymousContext)
        .then((rows) =>
          (Array.isArray(rows) ? rows : rows?.data || []).map((r) => r.name).filter(Boolean)
        ),
    ]);

    const staticTypes = ["chat", "chat-title", "data-tool", "consent-crafter", "translate"];
    const usageTypes = [...new Set([...staticTypes, ...agentList])];

    res.json({
      ...usersConfig,
      usageTypes,
    });
  });

  return api;
}

export default createAuthRouter;
