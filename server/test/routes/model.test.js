import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import request from "supertest";

import { createServerApi } from "../../services/api.js";

function buildApp({ invokeResult, listModelsResult } = {}) {
  const app = express();
  app.use((req, _res, next) => {
    req.session = {};
    next();
  });
  app.use(
    createServerApi({
      modules: {
        agents: {
          async *chat() {}
        },
        users: {},
        cms: {
          async getAgents() {
            return [];
          },
        },
        gateway: {
          async invoke(input) {
            if (typeof invokeResult === "function") {
              return invokeResult(input);
            }
            return (
              invokeResult || {
                echoed: input,
              }
            );
          },
          async listModels(input) {
            if (typeof listModelsResult === "function") {
              return listModelsResult(input);
            }
            return listModelsResult || [{ name: "Model A", type: input?.type || "chat" }];
          },
        },
      },
    })
  );
  return app;
}

describe("server model route", () => {
  it("mounts the shared gateway model router at the public invoke path", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/model")
      .set("X-API-Key", process.env.TEST_API_KEY)
      .set("X-Request-Id", "req-server-model")
      .send({ model: "test-model", messages: [{ role: "user", content: [{ text: "hello" }] }] });

    assert.equal(res.status, 200);
    assert.equal(res.body.echoed.userID > 0, true);
    assert.equal(res.body.echoed.requestId, "req-server-model");
    assert.equal(res.body.echoed.model, "test-model");
    assert.equal(typeof res.body.echoed.ip, "string");
  });

  it("mounts the shared gateway model router at the public list path", async () => {
    const app = buildApp();

    const res = await request(app)
      .get("/model/list?type=embedding")
      .set("X-API-Key", process.env.TEST_API_KEY);

    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, [{ name: "Model A", type: "embedding" }]);
  });

  it("preserves the edge 429 response shape", async () => {
    const app = buildApp({
      invokeResult: async () => ({ status: 429, error: "Rate limited", code: "IGNORED_AT_EDGE" }),
    });

    const res = await request(app)
      .post("/model")
      .set("X-API-Key", process.env.TEST_API_KEY)
      .send({ model: "test-model", messages: [{ role: "user", content: [{ text: "hello" }] }] });

    assert.equal(res.status, 429);
    assert.deepStrictEqual(res.body, { error: "Rate limited" });
  });

  it("preserves the edge invoke error message for unexpected failures", async () => {
    const app = buildApp({
      invokeResult: async () => {
        throw new Error("Gateway exploded");
      },
    });

    const res = await request(app)
      .post("/model")
      .set("X-API-Key", process.env.TEST_API_KEY)
      .send({ model: "test-model", messages: [{ role: "user", content: [{ text: "hello" }] }] });

    assert.equal(res.status, 500);
    assert.deepStrictEqual(res.body, {
      error: "An error occurred while processing the model request",
    });
  });

  it("preserves the edge list-models error message for unexpected failures", async () => {
    const app = buildApp({
      listModelsResult: async () => {
        throw new Error("List models exploded");
      },
    });

    const res = await request(app)
      .get("/model/list")
      .set("X-API-Key", process.env.TEST_API_KEY);

    assert.equal(res.status, 500);
    assert.deepStrictEqual(res.body, {
      error: "An error occurred while fetching models",
    });
  });
});
