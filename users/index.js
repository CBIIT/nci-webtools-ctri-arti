import http from "http";

import { getSchemaReadiness, waitForSchemaReady } from "database/readiness.js";
import express from "express";
import logger from "shared/logger.js";

import { createUsersRouter } from "./http.js";
import { createUsersService } from "./service.js";

const { PORT = 3004 } = process.env;
const application = createUsersService();
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
app.use("/api", createUsersRouter({ application }));

waitForSchemaReady()
  .then(() => {
    schemaReady = true;
  })
  .catch((error) => logger.error(`Users schema readiness failed: ${error.message || error}`));

http.createServer(app).listen(PORT, () => logger.info(`Users service listening on port ${PORT}`));
