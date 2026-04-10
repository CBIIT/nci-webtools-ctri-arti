import http from "http";

import express from "express";
import logger from "shared/logger.js";
import { createSchemaReadyServiceApp } from "shared/service-app.js";

import { createUsersApplication } from "./app.js";
import { createUsersRouter } from "./http.js";

const { PORT = 3004 } = process.env;
const application = createUsersApplication();
const router = express.Router();
router.use("/api/v1", createUsersRouter({ application }));
const app = createSchemaReadyServiceApp({
  router,
  readinessFailureMessage: "Users schema readiness failed",
});

http.createServer(app).listen(PORT, () => logger.info(`Users service listening on port ${PORT}`));
