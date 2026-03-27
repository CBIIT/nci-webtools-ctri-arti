import "../test-support/db.js";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import Handlebars from "handlebars";

import { sendJustificationEmail, sendUsageLimitChangeEmail } from "../integrations/email.js";

test("email template", async (t) => {
  const templatePath = new URL("../templates/error-log-report.hbs", import.meta.url);

  await t.test("template file can be read and compiled", async () => {
    const source = await readFile(templatePath, "utf8");
    assert.ok(source.length > 0, "Template file should not be empty");

    const template = Handlebars.compile(source, { strict: true });
    assert.strictEqual(typeof template, "function");
  });

  await t.test("template renders with valid data", async () => {
    const source = await readFile(templatePath, "utf8");
    const template = Handlebars.compile(source, { strict: true });

    const html = template({
      timestamp: "2024-01-15 10:30:00",
      userId: "123",
      userName: "Test User",
      version: "1.0.0",
      isUserReported: false,
      detailRows: [{ label: "Error", value: "Something failed", isMultiline: false }],
    });

    assert.ok(html.includes("Test User"));
    assert.ok(html.includes("Something failed"));
    assert.ok(html.includes("2024-01-15"));
  });

  await t.test("template renders user-reported variant", async () => {
    const source = await readFile(templatePath, "utf8");
    const template = Handlebars.compile(source, { strict: true });

    const html = template({
      timestamp: "2024-01-15 10:30:00",
      userId: "456",
      userName: "Reporter",
      version: null,
      isUserReported: true,
      detailRows: [],
    });

    assert.ok(html.length > 0);
  });

  await t.test("sendJustificationEmail formats the outgoing message", async () => {
    let sent = null;
    const env = {
      EMAIL_ADMIN: "admin@test.com",
      EMAIL_SENDER: "sender@test.com",
      TIER: "dev",
    };

    const result = await sendJustificationEmail(
      {
        justification: "Need more capacity",
        userName: "Test Admin",
        userEmail: "test@test.com",
        currentLimit: 1000,
      },
      env,
      async (params) => {
        sent = params;
        return { messageId: "test-message-id" };
      }
    );

    assert.deepStrictEqual(result, { messageId: "test-message-id" });
    assert.deepStrictEqual(sent, {
      from: "sender@test.com",
      to: "admin@test.com",
      subject: "[DEV] User Request Limit Increase",
      text:
        "Hello Admin Team,\n\n" +
        "A new request has been submitted to increase a user’s daily cost limit. Please review the details below:\n\n" +
        "User Name: [Test Admin]\nUser Email: [test@test.com]\nCurrent Daily Limit: $[1000]\n" +
        "Reason for Request:\n\nNeed more capacity\n\nPlease review this request and take the appropriate action.\n\n" +
        "Thank you,\nResearch Optimizer System",
    });
  });

  await t.test("sendUsageLimitChangeEmail formats the outgoing message", async () => {
    let sent = null;
    const env = {
      EMAIL_ADMIN: "admin@test.com",
      EMAIL_SENDER: "noreply@test.com",
      TIER: "dev",
    };

    const result = await sendUsageLimitChangeEmail(
      {
        userName: "Test User",
        userEmail: "user@test.com",
        previousLimit: 100,
        newLimit: 250,
        effectiveAt: "2026-03-27T14:15:16.000Z",
      },
      env,
      async (params) => {
        sent = params;
        return { messageId: "usage-limit-message-id" };
      }
    );

    assert.deepStrictEqual(result, { messageId: "usage-limit-message-id" });
    assert.equal(sent.from, "noreply@test.com");
    assert.equal(sent.to, "user@test.com");
    assert.equal(sent.subject, "[DEV] Your ResearchOptimizer AI Usage Limit Has Been Updated");
    assert.match(sent.text, /^Dear Test User,/);
    assert.match(sent.text, /Your AI daily usage limit has been increased from \$100 to \$250\./);
    assert.match(sent.text, /New Daily Usage Limit: \$250/);
    assert.match(sent.text, /Effective Date: March 27, 2026/);
    assert.match(sent.text, /Please do not reply to this email\./);
  });

  await t.test("sendUsageLimitChangeEmail no-ops when the limit is unchanged", async () => {
    let called = false;

    const result = await sendUsageLimitChangeEmail(
      {
        userName: "Test User",
        userEmail: "user@test.com",
        previousLimit: 100,
        newLimit: 100,
        effectiveAt: "2026-03-27T14:15:16.000Z",
      },
      {
        EMAIL_ADMIN: "admin@test.com",
        EMAIL_SENDER: "noreply@test.com",
      },
      async () => {
        called = true;
        return { messageId: "should-not-send" };
      }
    );

    assert.equal(result, null);
    assert.equal(called, false);
  });
});
