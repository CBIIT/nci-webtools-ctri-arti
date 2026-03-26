import { json, Router } from "express";
import { JSON_BODY_LIMIT } from "shared/http-limits.js";
import { createAnonymousRequestContext } from "shared/request-context.js";

import { loginMiddleware, oauthMiddleware } from "../middleware.js";

const { OAUTH_PROVIDER_ENABLED } = process.env;
const COMMON_USAGE_TYPES = [
  "agent",
  "browse-query",
  "chat",
  "chat-summary",
  "chat-title",
  "consent-crafter",
  "data-tool",
  "embedding",
  "guardrail",
  "translate",
];

function getDisabledApps(user, value = process.env.DISABLED_APPS) {
  const roleId = user?.Role?.id ?? user?.roleID;
  if (roleId === 1 || roleId === 2) return [];
  if (!value) return [];
  return value
    .split(",")
    .map((app) => app.trim())
    .filter(Boolean);
}

export function createAuthRouter({ modules } = {}) {
  if (!modules?.cms || !modules?.users) {
    throw new Error("cms and users modules are required");
  }

  const { cms, users } = modules;
  const api = Router();
  api.use(json({ limit: JSON_BODY_LIMIT }));

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

  api.get("/config", async (req, res) => {
    const apiKey = req.headers["x-api-key"];
    const user = await users.resolveIdentity({
      sessionUserId: req.session?.user?.id,
      apiKey,
    });
    const anonymousContext = createAnonymousRequestContext({ source: "server" });
    const [usersConfig, agentList] = await Promise.all([
      users.getConfig(),
      cms
        .getAgents(anonymousContext)
        .then((rows) =>
          (Array.isArray(rows) ? rows : rows?.data || []).map((r) => r.name).filter(Boolean)
        ),
    ]);

    const usageTypes = [...new Set([...COMMON_USAGE_TYPES, ...agentList])].sort();
    const disabled = getDisabledApps(user);

    res.json({
      ...usersConfig,
      disabled,
      usageTypes,
    });
  });

  return api;
}

export default createAuthRouter;
