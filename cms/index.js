import http from "http";

import { createGatewayRemote } from "gateway/remote.js";
import { createGatewayService } from "gateway/service.js";
import logger from "shared/logger.js";

import { createSchemaReadyServiceApp } from "../shared/service-app.js";

import { createCmsRouter } from "./http.js";
import { createCmsService } from "./service.js";

const { PORT = 3002, GATEWAY_URL } = process.env;
const gateway = GATEWAY_URL
  ? createGatewayRemote({ baseUrl: GATEWAY_URL })
  : createGatewayService();
const application = createCmsService({ gateway, source: "internal-http" });
const app = createSchemaReadyServiceApp({
  router: createCmsRouter({ application }),
  mountPath: "/api/v1",
  readinessFailureMessage: "CMS schema readiness failed",
});

http.createServer(app).listen(PORT, () => logger.info(`CMS listening on port ${PORT}`));
