import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

import express from "express";
import request from "supertest";

import { pop3 } from "../../services/email.js";
import api from "../../services/routes/tools.js";

const { TEST_API_KEY, SMTP_HOST, POP3_PORT = "3110", EMAIL_ADMIN } = process.env;

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.session = {};
    next();
  });
  app.use(api);
  return app;
}

const mail = pop3(SMTP_HOST, POP3_PORT);

describe("POST /usage", () => {
  const app = buildApp();

  before(async () => {
    await mail.purge(EMAIL_ADMIN);
  });

  after(async () => {
    await mail.purge(EMAIL_ADMIN);
  });

  it("sends justification email with correct content", async () => {
    const res = await request(app)
      .post("/usage")
      .set("X-API-Key", TEST_API_KEY)
      .send({ justification: "Need more capacity for dataset processing." });

    assert.equal(res.status, 200);

    const emails = await mail.getEmails(EMAIL_ADMIN);
    assert.equal(emails.length, 1);

    const email = emails[0];
    assert.equal(email.subject, "User Request Limit Increase");
    assert.ok(email.mimeMessage.includes("Test Admin"));
    assert.ok(email.mimeMessage.includes("test@test.com"));
    assert.ok(email.mimeMessage.includes("1000"));
    assert.ok(email.mimeMessage.includes("Need more capacity"));
  });
});
