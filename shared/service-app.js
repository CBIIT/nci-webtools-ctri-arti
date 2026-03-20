import { getSchemaReadiness, waitForSchemaReady } from "database/readiness.js";
import express from "express";

import logger from "./logger.js";

export function createSchemaReadyServiceApp({
  router,
  onReady,
  readinessFailureMessage = "Service schema readiness failed",
  expressImpl = express,
  getReadiness = getSchemaReadiness,
  waitUntilReady = waitForSchemaReady,
  loggerImpl = logger,
  autoStartReadiness = true,
} = {}) {
  if (!router) {
    throw new Error("service router is required");
  }

  let schemaReady = false;
  let readinessPromise = null;
  const app = expressImpl();

  async function startReadiness() {
    if (readinessPromise) return readinessPromise;

    readinessPromise = waitUntilReady()
      .then(async () => {
        schemaReady = true;
        await onReady?.();
      })
      .catch((error) => {
        loggerImpl.error(`${readinessFailureMessage}: ${error.message || error}`);
      });

    return readinessPromise;
  }

  app.disable("x-powered-by");
  app.get("/health", async (_req, res) => {
    const readiness = await getReadiness();
    res.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? "ok" : "waiting",
      schema: readiness,
    });
  });
  app.use(async (_req, res, next) => {
    if (schemaReady) return next();

    const readiness = await getReadiness();
    return res.status(503).json({
      error: "Service is starting",
      schema: readiness,
    });
  });
  app.use(router);

  app.startReadiness = startReadiness;

  if (autoStartReadiness) {
    void startReadiness();
  }

  return app;
}
