import assert from "node:assert/strict";
import net from "node:net";
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
let mailSkipReason = null;

async function isPortOpen(host, port) {
  if (!host || !port) return false;

  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(port) });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

describe("POST /usage", () => {
  const app = buildApp();

  before(async () => {
    if (!TEST_API_KEY || !SMTP_HOST || !POP3_PORT || !EMAIL_ADMIN) {
      mailSkipReason = "mail test env is not configured";
      return;
    }

    if (!(await isPortOpen(SMTP_HOST, POP3_PORT))) {
      mailSkipReason = `POP3 service not reachable at ${SMTP_HOST}:${POP3_PORT}`;
      return;
    }

    await mail.purge(EMAIL_ADMIN);
  });

  after(async () => {
    if (mailSkipReason) return;
    await mail.purge(EMAIL_ADMIN);
  });

  it("sends justification email with correct content", async (t) => {
    if (mailSkipReason) {
      t.skip(mailSkipReason);
    }

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
