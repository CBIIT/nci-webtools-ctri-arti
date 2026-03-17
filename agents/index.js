import http from "http";

import { createCmsRemote } from "cms/remote.js";
import { createCmsService } from "cms/service.js";
import { createGatewayRemote } from "gateway/remote.js";
import { createGatewayService } from "gateway/service.js";
import logger from "shared/logger.js";

import { createSchemaReadyServiceApp } from "../shared/service-app.js";

import { createAgentsApplication } from "./app.js";
import { createAgentsRouter } from "./http.js";

const { PORT = 3003, GATEWAY_URL, CMS_URL } = process.env;
const gateway = GATEWAY_URL
  ? createGatewayRemote({ baseUrl: GATEWAY_URL })
  : createGatewayService();
const cms = CMS_URL
  ? createCmsRemote({ baseUrl: CMS_URL })
  : createCmsService({ gateway, source: "direct" });
const application = createAgentsApplication({ gateway, cms, source: "internal-http" });
const app = createSchemaReadyServiceApp({
  router: createAgentsRouter({ application }),
  readinessFailureMessage: "Agents schema readiness failed",
});

http.createServer(app).listen(PORT, () => logger.info(`Agents service listening on port ${PORT}`));
