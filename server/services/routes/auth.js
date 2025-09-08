import { json, Router } from "express";

import { Role, User } from "../database.js";
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
  const isFirstUser = (await User.count()) === 0;
  const newUser = isFirstUser ? { roleId: 1 } : { roleId: 3, limit: 5 };
  session.user =
    (await User.findOne({ where: { email } })) ||
    (await User.create({ email, firstName, lastName, status: "active", ...newUser }));
  res.redirect(session.destination || "/");
});

api.get("/logout", (req, res) => {
  const destination = req.query.destination || "/";
  req.session.destroy(() => res.redirect(destination));
});

api.get("/session", async (req, res) => {
  const { session } = req;
  session.touch();
  session.expires = session.cookie.expires;
  if (session?.user?.id) {
    session.user = await User.findByPk(session.user.id, { include: [{ model: Role }] });
  }
  res.json({ user: session.user, expires: session.expires });
});

export default api;
