import db, { User } from "database";

import { isNotNull, sql } from "drizzle-orm";
import cron from "node-cron";

const { USAGE_RESET_SCHEDULE = "0 0 * * 0" } = process.env;

export const resetUsageLimits = () =>
  db
    .update(User)
    .set({ remaining: sql`${User.budget}` })
    .where(isNotNull(User.budget));

export const startScheduler = () => cron.schedule(USAGE_RESET_SCHEDULE, resetUsageLimits);
