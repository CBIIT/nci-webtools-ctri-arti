import assert from "node:assert/strict";
import { test } from "node:test";

import express from "express";
import request from "supertest";

import { createSchemaReadyServiceApp } from "../../shared/service-app.js";

function createDeferred() {
  let resolvePromise;
  let rejectPromise;

  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

test("createSchemaReadyServiceApp gates routes until readiness resolves", async () => {
  const deferred = createDeferred();
  let ready = false;
  let onReadyCalled = false;

  const router = express.Router();
  router.get("/ping", (_req, res) => {
    res.json({ ok: true });
  });

  const app = createSchemaReadyServiceApp({
    router,
    mountPath: "/api",
    getReadiness: async () => ({ ready }),
    waitUntilReady: () => deferred.promise,
    onReady: async () => {
      onReadyCalled = true;
    },
    loggerImpl: { error() {} },
  });

  const beforeReady = await request(app).get("/api/ping");
  assert.equal(beforeReady.status, 503);
  assert.equal(beforeReady.body.error, "Service is starting");

  const waitingHealth = await request(app).get("/health");
  assert.equal(waitingHealth.status, 503);
  assert.equal(waitingHealth.body.status, "waiting");

  ready = true;
  deferred.resolve();
  await deferred.promise;
  await new Promise((resolve) => setTimeout(resolve, 0));

  const afterReady = await request(app).get("/api/ping");
  assert.equal(afterReady.status, 200);
  assert.deepStrictEqual(afterReady.body, { ok: true });
  assert.equal(onReadyCalled, true);

  const readyHealth = await request(app).get("/health");
  assert.equal(readyHealth.status, 200);
  assert.equal(readyHealth.body.status, "ok");
});

test("createSchemaReadyServiceApp logs readiness failures", async () => {
  const failure = new Error("boom");
  const errors = [];

  createSchemaReadyServiceApp({
    router: express.Router(),
    waitUntilReady: () => Promise.reject(failure),
    loggerImpl: {
      error(message) {
        errors.push(message);
      },
    },
    readinessFailureMessage: "Custom readiness failure",
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepStrictEqual(errors, ["Custom readiness failure: boom"]);
});
