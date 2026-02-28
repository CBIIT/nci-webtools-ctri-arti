import db, { Role, User } from "database";

import { eq, count as countFn } from "drizzle-orm";
import { json, Router } from "express";

import { loginMiddleware, oauthMiddleware } from "../middleware.js";

const { OAUTH_PROVIDER_ENABLED, SESSION_TTL_POLL_MS } = process.env;

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

if (OAUTH_PROVIDER_ENABLED?.toLowerCase() === "true") {
  api.use("/oauth", oauthMiddleware());
}

api.get("/login", loginMiddleware, async (req, res) => {
  const { session } = req;
  const { email, first_name: firstName, last_name: lastName } = session.userinfo;
  if (!email) return res.redirect("/?error=missing_email");
  const [{ value: userCount }] = await db.select({ value: countFn() }).from(User);
  const isFirstUser = userCount === 0;
  const newUser = isFirstUser ? { roleID: 1 } : { roleID: 3, budget: 5 };
  const [existing] = await db.select().from(User).where(eq(User.email, email)).limit(1);
  session.user =
    existing ||
    (
      await db
        .insert(User)
        .values({ email, firstName, lastName, status: "active", ...newUser })
        .returning()
    )[0];
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
    session.user = await db.query.User.findFirst({
      where: eq(User.id, session.user.id),
      with: { Role: true },
    });
  }
  res.json({ user: session.user, expires: session.expires });
});

api.get("/session-ttl", async (req, res) => {
  const { session } = req;

  if (!session || !session.cookie || !session.cookie.expires) {
    return res.json({ ttl: null, error: "No session is found." });
  }

  const expiresDate = new Date(session.cookie.expires);
  const ttl = Math.round((expiresDate.valueOf() - Date.now()) / 1000);

  res.json({ ttl: ttl > 0 ? ttl : 0 });
});

api.get("/config", async (req, res) => {
  const defaultSessionTtlPollMs = 10 * 1000;

  res.json({ sessionTtlPollMs: parseInt(SESSION_TTL_POLL_MS, 10) || defaultSessionTtlPollMs });
});

export default api;
