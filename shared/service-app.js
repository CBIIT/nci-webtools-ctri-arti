import { getSchemaReadiness, waitForSchemaReady } from "database/readiness.js";
import express from "express";

import logger from "./logger.js";

export function createSchemaReadyServiceApp({
  router,
  mountPath,
  onReady,
  readinessFailureMessage = "Service schema readiness failed",
  expressImpl = express,
  getReadiness = getSchemaReadiness,
  waitUntilReady = waitForSchemaReady,
  loggerImpl = logger,
} = {}) {
  if (!router) {
    throw new Error("service router is required");
  }

  let schemaReady = false;
  const app = expressImpl();

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

  if (mountPath) {
    app.use(mountPath, router);
  } else {
    app.use(router);
  }

  waitUntilReady()
    .then(async () => {
      schemaReady = true;
      await onReady?.();
    })
    .catch((error) => loggerImpl.error(`${readinessFailureMessage}: ${error.message || error}`));

  return app;
}
