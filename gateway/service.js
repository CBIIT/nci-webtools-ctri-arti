import { createUsersApplication } from "users/app.js";

import { createGatewayApplication } from "./app.js";
import { createGatewayUsage } from "./core/usage.js";

export function createGatewayService({ users = createUsersApplication() } = {}) {
  const usage = createGatewayUsage({
    recordUsage: (...args) => users.recordUsage(...args),
  });

  return createGatewayApplication({
    usageTracker: usage.trackUsage,
    modelUsageTracker: usage.trackModelUsage,
  });
}


