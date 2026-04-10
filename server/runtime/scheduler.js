import cron from "node-cron";
import { USAGE_RESET_SCHEDULE } from "shared/cron.js";

import { getUsersModule } from "../compose.js";

export const resetUsageLimits = async () => {
  const users = await getUsersModule();
  return users.resetAllBudgets();
};

export const startScheduler = () => cron.schedule(USAGE_RESET_SCHEDULE, resetUsageLimits);
