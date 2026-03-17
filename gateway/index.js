import http from "http";

import { getSchemaReadiness, waitForSchemaReady } from "database/readiness.js";
import express from "express";
import logger from "shared/logger.js";
import { createUsersRemote } from "users/remote.js";
import { createUsersService } from "users/service.js";

import { createGatewayRouter } from "./http.js";
import { createGatewayService } from "./service.js";

const { PORT = 3001, USERS_URL } = process.env;
const users = USERS_URL ? createUsersRemote({ baseUrl: USERS_URL }) : createUsersService();
const appService = createGatewayService({ users });
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
app.use("/api", createGatewayRouter({ application: appService }));

waitForSchemaReady()
  .then(async () => {
    schemaReady = true;
    await appService.reconcileGuardrails();
  })
  .catch((error) => logger.error(`Gateway startup readiness failed: ${error.message || error}`));

http.createServer(app).listen(PORT, () => logger.info(`Gateway listening on port ${PORT}`));
