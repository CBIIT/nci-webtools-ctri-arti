import assert from "node:assert/strict";
import { describe, it } from "node:test";

import express from "express";
import request from "supertest";

import { createToolsRouter } from "../../services/routes/tools.js";

const { TEST_API_KEY } = process.env;

function buildApp(deps) {
  const app = express();
  app.use((req, res, next) => {
    req.session = {};
    next();
  });
  app.use(createToolsRouter(deps));
  return app;
}

describe("POST /usage", () => {
  it("passes the authenticated user's usage request to the email service", async () => {
    let captured = null;
    const app = buildApp({
      sendJustificationEmailImpl: async (data) => {
        captured = data;
        return { accepted: ["admin@localhost"] };
      },
    });

    const res = await request(app)
      .post("/usage")
      .set("X-API-Key", TEST_API_KEY)
      .send({ justification: "Need more capacity for dataset processing." });

    assert.equal(res.status, 200);
    assert.deepStrictEqual(res.body, { accepted: ["admin@localhost"] });
    assert.deepStrictEqual(captured, {
      justification: "Need more capacity for dataset processing.",
      userName: "Test Admin",
      userEmail: "test@test.com",
      currentLimit: 1000,
    });
  });
});
