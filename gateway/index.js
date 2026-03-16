import http from "http";

import express from "express";
import logger from "shared/logger.js";

import { createGatewayApplication } from "./app.js";
import gatewayApi from "./api.js";

const { PORT = 3001 } = process.env;
const appService = createGatewayApplication();

const app = express();
app.disable("x-powered-by");
app.use("/api", gatewayApi);
app.get("/health", (req, res) => res.json({ status: "ok" }));

appService
  .reconcileGuardrails()
  .catch((error) =>
    logger.error(`Guardrail startup reconciliation failed: ${error.message || error}`)
  )
  .finally(() => {
    http.createServer(app).listen(PORT, () =>
      logger.info(`Gateway listening on port ${PORT}`)
    );
  });
