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

  await t.test("config exposes env-disabled apps for non-admin config requests", async () => {
    const previousDisabledApps = process.env.DISABLED_APPS;
    process.env.DISABLED_APPS = "Translate, Consent Crafter";

    try {
      const res = await request(app).get("/api/v1/config");

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.usageTypes), "config should return usageTypes");
      assert.ok(Array.isArray(res.body.disabled), "config should return disabled apps");
      assert.ok(res.body.usageTypes.includes("embedding"));
      assert.ok(res.body.usageTypes.includes("guardrail"));
      assert.ok(res.body.usageTypes.includes("chat-summary"));
      assert.deepStrictEqual(res.body.disabled, ["Translate", "Consent Crafter"]);
      assert.equal("budgetResetSchedule" in res.body, false);
    } finally {
      if (previousDisabledApps === undefined) {
        delete process.env.DISABLED_APPS;
      } else {
        process.env.DISABLED_APPS = previousDisabledApps;
      }
    }
  });

  await t.test("config hides disabled apps from users with admin or super user roles", async () => {
    const previousDisabledApps = process.env.DISABLED_APPS;
    process.env.DISABLED_APPS = "Translate, Consent Crafter";

    try {
      const res = await request(app)
        .get("/api/v1/config")
        .set("X-API-Key", process.env.TEST_API_KEY);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.disabled), "config should return disabled apps");
      assert.deepStrictEqual(res.body.disabled, []);
    } finally {
      if (previousDisabledApps === undefined) {
        delete process.env.DISABLED_APPS;
      } else {
        process.env.DISABLED_APPS = previousDisabledApps;
      }
    }
  });

  await t.test("session resolves an API-key-authenticated user for browser clients", async () => {
    const sessionRes = await request(app)
      .get("/api/v1/session")
      .set("X-API-Key", process.env.TEST_API_KEY);

    assert.equal(sessionRes.status, 200);
    assert.ok(sessionRes.body.user, "session should return a user when authenticated by API key");
    assert.equal(sessionRes.body.user.email, "test@test.com");
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
