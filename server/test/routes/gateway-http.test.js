import "../../test-support/db.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import { createGatewayRouter } from "gateway/http.js";
import request from "supertest";

function createGatewayApplication() {
  return {
    async invoke(input) {
      return { echoed: input };
    },
    async listModels() {
      return [];
    },
    async listGuardrails() {
      return [];
    },
    async reconcileGuardrails(input) {
      return { echoed: input };
    },
    async deleteGuardrail(id) {
      return { id };
    },
    async trackUsage(userId, model, usageItems, options) {
      return { userId, model, usageItems, options };
    },
    async trackModelUsage(userId, model, usageData, options) {
      return { userId, model, usageData, options };
    },
  };
}

function buildApp(application = createGatewayApplication()) {
  const app = express();
  app.use(createGatewayRouter({ application }));
  return app;
}

describe("gateway router", () => {
  it("parses JSON bodies for guardrail reconciliation at the parent router level", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/guardrails/reconcile")
      .send({ ids: [1, 2, 3] });

    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, {
      echoed: {
        ids: [1, 2, 3],
      },
    });
  });

  it("parses JSON bodies for usage routes with the canonical userId shape", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/usage")
      .send({
        userId: 7,
        model: "mock-model",
        usageItems: [{ quantity: 1, unit: "input_tokens" }],
        options: { requestId: "req-gateway-usage" },
      });

    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, {
      userId: 7,
      model: "mock-model",
      usageItems: [{ quantity: 1, unit: "input_tokens" }],
      options: { requestId: "req-gateway-usage" },
    });
  });
});
