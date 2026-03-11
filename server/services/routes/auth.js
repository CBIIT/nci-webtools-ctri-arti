import db, { Agent, Role, User } from "database";

import { eq, count as countFn } from "drizzle-orm";
import { json, Router } from "express";
import { describeCron } from "shared/cron.js";

import { loginMiddleware, oauthMiddleware } from "../middleware.js";
import { USAGE_RESET_SCHEDULE } from "../scheduler.js";

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
  const [{ value: userCount }] = await db.select({ value: countFn() }).from(User);
  const isFirstUser = userCount === 0;
  const newUser = isFirstUser ? { roleID: 1 } : { roleID: 3, budget: 1 };
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

api.all("/session", async (req, res) => {
  const { session } = req;
  if (req.method === "POST") {
    session.touch();
    session.expires = session.cookie.expires;
  }
  const user = session.user?.id
    ? await db.query.User.findFirst({ where: eq(User.id, session.user.id), with: { Role: true } })
    : session.user;
  res.json({ user, expires: session.cookie.expires });
});

api.get("/config", async (req, res) => {
  const { label: budgetLabel, resetDescription: budgetResetDescription } =
    describeCron(USAGE_RESET_SCHEDULE);

  const agents = await db
    .selectDistinct({ name: Agent.name })
    .from(Agent)
    .then((rows) => rows.map((r) => r.name).filter(Boolean));

  const staticTypes = ["chat", "chat-title", "data-tool", "consent-crafter", "translate"];
  const usageTypes = [...new Set([...staticTypes, ...agents])];

  res.json({
    budgetResetSchedule: USAGE_RESET_SCHEDULE,
    budgetLabel,
    budgetResetDescription,
    usageTypes,
  });
});

export default api;
