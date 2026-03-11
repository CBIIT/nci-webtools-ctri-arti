import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

import express from "express";
import request from "supertest";

import api from "../../services/routes/tools.js";

const { TEST_API_KEY, SMTP_HOST, GREENMAIL_API_PORT, EMAIL_ADMIN } = process.env;
const greenmailApi = `http://${SMTP_HOST}:${GREENMAIL_API_PORT}`;
const emailUser = encodeURIComponent(EMAIL_ADMIN);

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.session = {};
    next();
  });
  app.use(api);
  return app;
}

async function getEmails() {
  const res = await fetch(`${greenmailApi}/api/user/${emailUser}/messages`);
  return res.json();
}

async function purgeEmails() {
  await fetch(`${greenmailApi}/api/mail/purge`, { method: "POST" });
}

describe("POST /usage", () => {
  const app = buildApp();

  before(async () => {
    await purgeEmails();
  });

  after(async () => {
    await purgeEmails();
  });

  it("sends justification email with correct content", async () => {
    const res = await request(app)
      .post("/usage")
      .set("X-API-Key", TEST_API_KEY)
      .send({ justification: "Need more capacity for dataset processing." });

    assert.equal(res.status, 200);

    const emails = await getEmails();
    assert.equal(emails.length, 1);

    const email = emails[0];
    assert.equal(email.subject, "User Request Limit Increase");
    assert.ok(email.mimeMessage.includes("Test Admin"));
    assert.ok(email.mimeMessage.includes("test@test.com"));
    assert.ok(email.mimeMessage.includes("1000"));
    assert.ok(email.mimeMessage.includes("Need more capacity"));
  });
});
