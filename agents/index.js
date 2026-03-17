import http from "http";

import { createCmsRemote } from "cms/remote.js";
import { createCmsService } from "cms/service.js";
import { getSchemaReadiness, waitForSchemaReady } from "database/readiness.js";
import express from "express";
import { createGatewayRemote } from "gateway/remote.js";
import { createGatewayService } from "gateway/service.js";
import logger from "shared/logger.js";

import { createAgentsRouter } from "./http.js";
import { createAgentsService } from "./service.js";

const { PORT = 3003, GATEWAY_URL, CMS_URL } = process.env;
const gateway = GATEWAY_URL
  ? createGatewayRemote({ baseUrl: GATEWAY_URL })
  : createGatewayService();
const cms = CMS_URL
  ? createCmsRemote({ baseUrl: CMS_URL })
  : createCmsService({ gateway, source: "direct" });
const application = createAgentsService({ gateway, cms, source: "internal-http" });
let schemaReady = false;

const app = express();
app.disable("x-powered-by");
app.get("/health", async (_req, res) => {
  const readiness = await getSchemaReadiness();
  res.status(readiness.ready ? 200 : 503).json({
    status: readiness.ready ? "ok" : "waiting",
    schema: readiness,
  });
});
app.use(async (_req, res, next) => {
  if (schemaReady) return next();

  const readiness = await getSchemaReadiness();
  return res.status(503).json({
    error: "Service is starting",
    schema: readiness,
  });
});
app.use(createAgentsRouter({ application }));

waitForSchemaReady()
  .then(() => {
    schemaReady = true;
  })
  .catch((error) => logger.error(`Agents schema readiness failed: ${error.message || error}`));

http.createServer(app).listen(PORT, () => logger.info(`Agents service listening on port ${PORT}`));
