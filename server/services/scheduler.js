import db, { User } from "database";

import { isNotNull, sql } from "drizzle-orm";
import cron from "node-cron";

export const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";

export const resetUsageLimits = () =>
  db
    .update(User)
    .set({ remaining: sql`${User.budget}` })
    .where(isNotNull(User.budget));

export const startScheduler = () => cron.schedule(USAGE_RESET_SCHEDULE, resetUsageLimits);
