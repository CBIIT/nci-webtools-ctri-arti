import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import request from "supertest";

import { createAgentsChatRouter } from "agents/http.js";

function buildApp(application = null) {
  const app = express();
  app.use(
    createAgentsChatRouter({
      application: application || {
        async chat() {
          throw new Error("chat should not be called in request context validation tests");
        },
      },
    })
  );
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
      .post("/agents/1/conversations/1/chat")
      .set("X-User-Id", "anonymous")
      .send(body);

    assert.equal(res.status, 401);
    assert.deepStrictEqual(res.body, { error: "Authentication required" });
  });

  it("rejects invalid internal user id headers", async () => {
    const res = await request(app)
      .post("/agents/1/conversations/1/chat")
      .set("X-User-Id", "not-a-user")
      .send(body);

    assert.equal(res.status, 400);
    assert.match(res.body.error, /positive integer/);
  });

  it("rejects requests without message content", async () => {
    const res = await request(app)
      .post("/agents/1/conversations/1/chat")
      .set("X-User-Id", "1")
      .send({});

    assert.equal(res.status, 400);
    assert.deepStrictEqual(res.body, { error: "Message content required" });
  });

  it("rejects user messages that contain tool uses", async () => {
    const res = await request(app)
      .post("/agents/1/conversations/1/chat")
      .set("X-User-Id", "1")
      .send({
        message: {
          content: [{ toolUse: { toolUseId: "tu_1", name: "search", input: { query: "nci" } } }],
        },
      });

    assert.equal(res.status, 400);
    assert.deepStrictEqual(res.body, { error: "User messages cannot contain tool uses" });
  });

  it("supports an ephemeral chat route without conversationId", async () => {
    const ephemeralApp = buildApp({
      async *chat({ conversationId, message }) {
        assert.equal(conversationId, null);
        assert.deepStrictEqual(message, {
          content: [{ type: "text", text: "Hello" }],
        });
        yield { contentBlockDelta: { delta: { text: "ephemeral-ok" } } };
        yield { messageStop: { stopReason: "end_turn" } };
      },
    });

    const res = await request(ephemeralApp).post("/agents/1/chat").set("X-User-Id", "1").send(body);

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /^application\/x-ndjson/);
    assert.match(res.text, /ephemeral-ok/);
  });

  it("returns requestId immediately when background=true", async () => {
    const backgroundApp = buildApp({
      async *chat() {
        await new Promise((resolve) => setTimeout(resolve, 25));
        yield { messageStop: { stopReason: "end_turn" } };
      },
    });

    const res = await request(backgroundApp)
      .post("/agents/1/chat")
      .set("X-User-Id", "1")
      .send({
        ...body,
        background: true,
      });

    assert.equal(res.status, 202);
    assert.equal(res.body.background, true);
    assert.equal(typeof res.body.requestId, "string");
    assert.ok(res.body.requestId.length > 10);
  });
});
