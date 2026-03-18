import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import request from "supertest";

import { createServerApi } from "../../api/index.js";

function buildApp() {
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
          async createAgent(context, data) {
            return { id: 101, userId: context.userId, ...data };
          },
          async getAgents(context) {
            return [{ id: 1, owner: context.userId }];
          },
          async getAgent(context, id) {
            if (id === "404") return null;
            return { id: Number(id), owner: context.userId };
          },
          async updateAgent(context, id, data) {
            return { id: Number(id), owner: context.userId, ...data };
          },
          async deleteAgent() {
            return undefined;
          },
        },
        gateway: {
          async listModels() {
            return [];
          },
        },
      },
    })
  );
  return app;
}

describe("server CMS agents routes", () => {
  const app = buildApp();

  it("mounts the shared CMS agents router at the public list path", async () => {
    const res = await request(app).get("/agents").set("X-API-Key", process.env.TEST_API_KEY);

    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, [{ id: 1, owner: 1 }]);
  });

  it("mounts the shared CMS agents router at the public create path", async () => {
    const res = await request(app)
      .post("/agents")
      .set("X-API-Key", process.env.TEST_API_KEY)
      .send({ name: "Shared Agent" });

    assert.equal(res.status, 201);
    assert.deepStrictEqual(res.body, { id: 101, userId: 1, name: "Shared Agent" });
  });

  it("preserves 404 handling for missing agents", async () => {
    const res = await request(app).get("/agents/404").set("X-API-Key", process.env.TEST_API_KEY);

    assert.equal(res.status, 404);
    assert.deepStrictEqual(res.body, { error: "Agent not found" });
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/agents");

    assert.equal(res.status, 401);
    assert.deepStrictEqual(res.body, { error: "Authentication required" });
  });
});


