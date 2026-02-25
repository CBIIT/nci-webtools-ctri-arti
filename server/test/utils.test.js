import assert from "node:assert";
import { test } from "node:test";

import { retry, createHttpError, routeHandler, getDateRange, createCertificate } from "../services/utils.js";

test("retry", async (t) => {
  await t.test("succeeds on first try", async () => {
    const result = await retry(() => Promise.resolve("ok"));
    assert.strictEqual(result, "ok");
  });

  await t.test("retries on failure then succeeds", async () => {
    let attempts = 0;
    const result = await retry(() => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
      return Promise.resolve("ok");
    }, 3, 0);
    assert.strictEqual(result, "ok");
    assert.strictEqual(attempts, 3);
  });

  await t.test("throws after exhausting all attempts", async () => {
    await assert.rejects(
      () => retry(() => { throw new Error("always fails"); }, 2, 0),
      (err) => {
        assert.ok(err.message.includes("Failed after 2 attempts"));
        return true;
      },
    );
  });

  await t.test("uses exponential backoff", async () => {
    let attempts = 0;
    const start = Date.now();
    await assert.rejects(
      () => retry(() => { attempts++; throw new Error("fail"); }, 2, 50),
    );
    const elapsed = Date.now() - start;
    // With initialDelay=50 and 2 attempts, there's 1 delay of 50ms + jitter (0-100ms)
    assert.ok(elapsed >= 40, `Expected at least 40ms elapsed, got ${elapsed}ms`);
    assert.strictEqual(attempts, 2);
  });
});

test("createHttpError", async (t) => {
  await t.test("creates error from string", () => {
    const err = createHttpError(400, "bad input", "Invalid request");
    assert.ok(err instanceof Error);
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(err.message, "Invalid request");
    assert.strictEqual(err.additionalError, "bad input");
  });

  await t.test("creates error from Error object", () => {
    const original = new Error("original message");
    const err = createHttpError(500, original, "Something went wrong");
    assert.ok(err === original); // same object, mutated
    assert.strictEqual(err.statusCode, 500);
    assert.strictEqual(err.message, "Something went wrong");
    assert.strictEqual(err.additionalError, "original message");
  });

  await t.test("uses error message as fallback when no userMessage provided", () => {
    const err = createHttpError(404, "not found");
    assert.strictEqual(err.message, "not found");
    assert.strictEqual(err.additionalError, "not found");
  });
});

test("routeHandler", async (t) => {
  await t.test("calls handler and returns result", async () => {
    let called = false;
    const handler = routeHandler(async (req, res) => { called = true; });
    await handler({}, {}, () => {});
    assert.ok(called);
  });

  await t.test("catches errors and forwards via next", async () => {
    let nextError = null;
    const handler = routeHandler(async () => { throw new Error("boom"); });
    await handler({}, {}, (err) => { nextError = err; });
    assert.ok(nextError instanceof Error);
    assert.strictEqual(nextError.message, "boom");
  });
});

test("getDateRange", async (t) => {
  await t.test("returns default range (last 30 days)", () => {
    const { startDate, endDate } = getDateRange();
    assert.ok(startDate instanceof Date);
    assert.ok(endDate instanceof Date);
    assert.ok(startDate < endDate);

    const now = new Date();
    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays >= 29 && diffDays <= 31, `Expected ~30 days, got ${diffDays}`);
  });

  await t.test("accepts custom start and end dates", () => {
    // Use ISO dates with explicit time to avoid timezone edge cases
    const { startDate, endDate } = getDateRange("2024-06-15", "2024-06-20");
    assert.strictEqual(startDate.getFullYear(), 2024);
    assert.strictEqual(startDate.getMonth(), 5); // June = 5
    assert.ok(endDate > startDate);
  });

  await t.test("start date begins at midnight, end date ends at 23:59:59", () => {
    const { startDate, endDate } = getDateRange("2024-06-15", "2024-06-15");
    assert.strictEqual(startDate.getHours(), 0);
    assert.strictEqual(startDate.getMinutes(), 0);
    assert.strictEqual(endDate.getHours(), 23);
    assert.strictEqual(endDate.getMinutes(), 59);
  });
});

test("createCertificate", async (t) => {
  await t.test("generates valid PEM key and cert", () => {
    const { key, cert } = createCertificate();
    assert.ok(key.startsWith("-----BEGIN RSA PRIVATE KEY-----"));
    assert.ok(cert.startsWith("-----BEGIN CERTIFICATE-----"));
    assert.ok(key.includes("-----END RSA PRIVATE KEY-----"));
    assert.ok(cert.includes("-----END CERTIFICATE-----"));
  });

  await t.test("accepts custom attributes", () => {
    const { cert } = createCertificate({ attrs: { CN: "example.com", O: "TestOrg" } });
    assert.ok(cert.startsWith("-----BEGIN CERTIFICATE-----"));
  });

  await t.test("accepts custom altNames", () => {
    const altNames = [{ type: 2, value: "test.example.com" }];
    const { cert } = createCertificate({ altNames });
    assert.ok(cert.startsWith("-----BEGIN CERTIFICATE-----"));
  });
});
