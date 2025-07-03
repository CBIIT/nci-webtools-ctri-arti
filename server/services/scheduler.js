import cron from 'node-cron';
import { User } from './database.js';
import { Op } from 'sequelize';

const { USAGE_RESET_SCHEDULE = '0 0 * * 0' } = process.env;

export const resetUsageLimits = () => User.update({ remaining: User.sequelize.col('limit') }, { where: { limit: { [Op.ne]: null } } });

export const startScheduler = () => cron.schedule(USAGE_RESET_SCHEDULE, resetUsageLimits);