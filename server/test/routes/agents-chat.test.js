import "../../test-support/db.js";
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
          async *chat({ context, agentId, conversationId, modelOverride }) {
            yield {
              metadata: {
                userId: context.userId,
                agentId,
                conversationId,
                modelOverride,
              },
            };
            yield { contentBlockDelta: { delta: { text: "route-shared" } } };
          },
        },
        users: {},
        cms: {},
        gateway: {},
      },
    })
  );
  return app;
}

describe("server agents chat route", () => {
  const app = buildApp();

  it("mounts the shared agents chat router at the public server path", async () => {
    const res = await request(app)
      .post("/agents/11/conversations/22/chat")
      .set("X-API-Key", process.env.TEST_API_KEY)
      .send({
        message: { content: [{ text: "hello" }] },
        modelOverride: "test-model",
      });

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /^application\/x-ndjson/);
    assert.match(res.text, /route-shared/);
    assert.match(res.text, /"userId":\d+/);
    assert.match(res.text, /"agentId":11/);
    assert.match(res.text, /"conversationId":22/);
    assert.match(res.text, /"modelOverride":"test-model"/);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .post("/agents/11/conversations/22/chat")
      .send({
        message: { content: [{ text: "hello" }] },
      });

    assert.equal(res.status, 401);
    assert.deepStrictEqual(res.body, { error: "Authentication required" });
  });

  it("keeps request validation in the shared router", async () => {
    const res = await request(app)
      .post("/agents/11/conversations/22/chat")
      .set("X-API-Key", process.env.TEST_API_KEY)
      .send({});

    assert.equal(res.status, 400);
    assert.deepStrictEqual(res.body, { error: "Message content required" });
  });
});
