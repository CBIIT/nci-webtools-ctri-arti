import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import request from "supertest";

import api from "agents/api.js";

function buildApp() {
  const app = express();
  app.use(api);
  return app;
}

describe("Agents API request context", () => {
  const app = buildApp();
  const body = {
    message: {
      content: [{ type: "text", text: "Hello" }],
    },
  };

  it("rejects explicit anonymous internal requests", async () => {
    const res = await request(app)
      .post("/api/agents/1/conversations/1/chat")
      .set("X-User-Id", "anonymous")
      .send(body);

    assert.equal(res.status, 401);
    assert.deepStrictEqual(res.body, { error: "Authentication required" });
  });

  it("rejects invalid internal user id headers", async () => {
    const res = await request(app)
      .post("/api/agents/1/conversations/1/chat")
      .set("X-User-Id", "not-a-user")
      .send(body);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /positive integer/);
  });

  it("rejects requests without message content", async () => {
    const res = await request(app)
      .post("/api/agents/1/conversations/1/chat")
      .set("X-User-Id", "1")
      .send({});

    assert.equal(res.status, 400);
    assert.deepStrictEqual(res.body, { error: "Message content required" });
  });
});
