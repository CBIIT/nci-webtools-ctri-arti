import cron from "node-cron";

import { getUsersModule } from "../compose.js";

export const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";

export const resetUsageLimits = async () => {
  const users = await getUsersModule();
  return users.resetAllBudgets();
};

export const startScheduler = () => cron.schedule(USAGE_RESET_SCHEDULE, resetUsageLimits);

