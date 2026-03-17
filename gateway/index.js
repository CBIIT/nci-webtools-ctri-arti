import http from "http";

import express from "express";
import logger from "shared/logger.js";
import { createUsersRemote } from "users/remote.js";
import { createUsersService } from "users/service.js";

import { createGatewayRouter } from "./http.js";
import { createGatewayService } from "./service.js";

const { PORT = 3001, USERS_URL } = process.env;
const users = USERS_URL ? createUsersRemote({ baseUrl: USERS_URL }) : createUsersService();
const appService = createGatewayService({ users });

const app = express();
app.disable("x-powered-by");
app.use("/api", createGatewayRouter({ application: appService }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

appService
  .reconcileGuardrails()
  .catch((error) =>
    logger.error(`Guardrail startup reconciliation failed: ${error.message || error}`)
  )
  .finally(() => {
    http.createServer(app).listen(PORT, () => logger.info(`Gateway listening on port ${PORT}`));
  });
