import http from "http";

import { createCmsRemote } from "cms/remote.js";
import { createCmsService } from "cms/service.js";
import express from "express";
import { createGatewayRemote } from "gateway/remote.js";
import { createGatewayService } from "gateway/service.js";
import logger from "shared/logger.js";
import { createUsersApplication } from "users/app.js";
import { createUsersRemote } from "users/remote.js";
import { sendEmail } from "server/integrations/email.js";

import { createSchemaReadyServiceApp } from "../shared/service-app.js";

import { createAgentsApplication } from "./app.js";
import { createAgentsRouter } from "./http.js";

const { PORT = 3003, GATEWAY_URL, CMS_URL, USERS_URL } = process.env;
const gateway = GATEWAY_URL
  ? createGatewayRemote({ baseUrl: GATEWAY_URL })
  : createGatewayService();
const cms = CMS_URL
  ? createCmsRemote({ baseUrl: CMS_URL })
  : createCmsService({ gateway, source: "direct" });
const users = USERS_URL ? createUsersRemote({ baseUrl: USERS_URL }) : createUsersApplication();
const application = createAgentsApplication({
  gateway,
  cms,
  users,
  sendEmail,
  source: "internal-http",
});
const router = express.Router();
router.use("/api/v1", createAgentsRouter({ application }));
const app = createSchemaReadyServiceApp({
  router,
  readinessFailureMessage: "Agents schema readiness failed",
});

http.createServer(app).listen(PORT, () => logger.info(`Agents service listening on port ${PORT}`));
