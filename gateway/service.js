import { createUsersService } from "users/service.js";

import { createGatewayApplication } from "./app.js";
import { createGatewayUsage } from "./usage.js";

export function createGatewayService({ users = createUsersService() } = {}) {
  const usage = createGatewayUsage({
    recordUsage: (...args) => users.recordUsage(...args),
  });

  return createGatewayApplication({
    usageTracker: usage.trackUsage,
    modelUsageTracker: usage.trackModelUsage,
  });
}
