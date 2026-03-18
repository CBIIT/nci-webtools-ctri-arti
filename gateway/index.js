import http from "http";

import logger from "shared/logger.js";
import { createUsersApplication } from "users/app.js";
import { createUsersRemote } from "users/remote.js";

import { createSchemaReadyServiceApp } from "../shared/service-app.js";

import { createGatewayRouter } from "./http.js";
import { createGatewayService } from "./service.js";

const { PORT = 3001, USERS_URL } = process.env;
const users = USERS_URL ? createUsersRemote({ baseUrl: USERS_URL }) : createUsersApplication();
const appService = createGatewayService({ users });
const app = createSchemaReadyServiceApp({
  router: createGatewayRouter({ application: appService }),
  mountPath: "/api/v1",
  onReady: () => appService.reconcileGuardrails(),
  readinessFailureMessage: "Gateway startup readiness failed",
});

http.createServer(app).listen(PORT, () => logger.info(`Gateway listening on port ${PORT}`));
