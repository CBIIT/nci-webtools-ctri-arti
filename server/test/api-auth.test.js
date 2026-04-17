import "../test-support/db.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import request from "supertest";

import { createApp } from "../server.js";

test("server auth posture keeps public routes explicit", async (t) => {
  const app = await createApp({
    ...process.env,
    CLIENT_FOLDER: "../client",
    SESSION_SECRET: process.env.SESSION_SECRET || "test-session-secret",
  });

  await t.test("intended public routes stay public", async () => {
    const [statusRes, configRes, sessionRes, logoutRes] = await Promise.all([
      request(app).get("/api/v1/status"),
      request(app).get("/api/v1/config"),
      request(app).get("/api/v1/session"),
      request(app).get("/api/v1/logout"),
    ]);

    assert.equal(statusRes.status, 200);
    assert.equal(configRes.status, 200);
    assert.equal(sessionRes.status, 200);
    assert.equal(logoutRes.status, 302);
  });

  await t.test("config exposes shared client settings including disabledTools", async () => {
    const res = await request(app).get("/api/v1/config");

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.usageTypes), "config should return usageTypes");
    assert.ok(res.body.usageTypes.includes("embedding"));
    assert.ok(res.body.usageTypes.includes("guardrail"));
    assert.ok(res.body.usageTypes.includes("chat-summary"));
    assert.ok(Array.isArray(res.body.disabledTools), "config should return disabledTools");
    assert.equal("budgetResetSchedule" in res.body, false);
  });

  await t.test("session resolves an API-key-authenticated user for browser clients", async () => {
    const sessionRes = await request(app)
      .get("/api/v1/session")
      .set("X-API-Key", process.env.TEST_API_KEY);

    assert.equal(sessionRes.status, 200);
    assert.ok(sessionRes.body.user, "session should return a user when authenticated by API key");
    assert.equal(sessionRes.body.user.email, "test@test.com");
    assert.ok(sessionRes.body.access, "session should return top-level access policies");
    assert.ok(sessionRes.body.user.access, "session user should include access policies");
    assert.deepStrictEqual(sessionRes.body.access, sessionRes.body.user.access);
    assert.equal(sessionRes.body.user.access["*"]?.["*"], true);
  });

  await t.test("anonymous session returns top-level access for user-visible routes", async () => {
    const sessionRes = await request(app).get("/api/v1/session");

    assert.equal(sessionRes.status, 200);
    assert.equal(sessionRes.body.user, null);
    assert.ok(sessionRes.body.access, "anonymous session should include top-level access");
    assert.equal(sessionRes.body.access["/tools/consent-crafter"]?.view, true);
    assert.equal(sessionRes.body.access["/_/profile"]?.view, true);
    assert.equal(sessionRes.body.access["/tools/chat"]?.view, undefined);
  });

  await t.test("protected routes reject unauthenticated access", async () => {
    const [searchRes, conversationsRes, usageRes, logRes] = await Promise.all([
      request(app).get("/api/v1/search"),
      request(app).get("/api/v1/conversations"),
      request(app).post("/api/v1/usage").send({ justification: "Need access" }),
      request(app)
        .post("/api/v1/log")
        .send({ metadata: { error: "test" } }),
    ]);

    assert.equal(searchRes.status, 401);
    assert.equal(conversationsRes.status, 401);
    assert.equal(usageRes.status, 401);
    assert.equal(logRes.status, 401);
  });
});
