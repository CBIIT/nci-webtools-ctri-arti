import { json, Router } from "express";
import { getAgents } from "shared/clients/cms.js";
import { createAnonymousRequestContext } from "shared/request-context.js";
import { findOrCreateUser, getUser, getConfig as getUsersConfig } from "shared/clients/users.js";

import { loginMiddleware, oauthMiddleware } from "../middleware.js";

const { OAUTH_PROVIDER_ENABLED } = process.env;

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

if (OAUTH_PROVIDER_ENABLED?.toLowerCase() === "true") {
  api.use("/oauth", oauthMiddleware());
}

api.get("/login", loginMiddleware, async (req, res) => {
  const { session } = req;
  const { email, first_name: firstName, last_name: lastName } = session.userinfo;
  if (!email) return res.redirect("/?error=missing_email");
  session.user = await findOrCreateUser({ email, firstName, lastName });
  res.redirect(session.destination || "/");
});

api.get("/logout", (req, res) => {
  const destination = req.query.destination || "/";
  req.session.destroy(() => res.redirect(destination));
});

api.all("/session", async (req, res) => {
  const { session } = req;
  if (req.method === "POST") {
    session.touch();
    session.expires = session.cookie.expires;
  }
  const user = session.user?.id ? await getUser(session.user.id) : session.user;
  res.json({ user, expires: session.cookie.expires });
});

api.get("/config", async (req, res) => {
  const anonymousContext = createAnonymousRequestContext({ source: "server" });
  const [usersConfig, agentList] = await Promise.all([
    getUsersConfig(),
    getAgents(anonymousContext).then((rows) =>
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

export default api;
