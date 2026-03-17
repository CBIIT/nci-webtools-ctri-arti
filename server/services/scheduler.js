import cron from "node-cron";

import { resetAllBudgets } from "../users.js";

export const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";

export const resetUsageLimits = () => resetAllBudgets();

export const startScheduler = () => cron.schedule(USAGE_RESET_SCHEDULE, resetUsageLimits);
