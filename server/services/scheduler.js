import cron from "node-cron";
import { Op } from "sequelize";

import { User } from "./database.js";

const { USAGE_RESET_SCHEDULE = "0 0 * * *" } = process.env;

export const resetUsageLimits = () =>
  User.update({ remaining: User.sequelize.col("budget") }, { where: { budget: { [Op.ne]: null } } });

export const startScheduler = () => cron.schedule(USAGE_RESET_SCHEDULE, resetUsageLimits);
