import assert from "node:assert";
import { test } from "node:test";

import { formatObject, createLogger } from "shared/logger.js";

test("formatObject", async (t) => {
  await t.test("formats string input", () => {
    assert.strictEqual(formatObject("hello"), "hello");
  });

  await t.test("formats number input", () => {
    assert.strictEqual(formatObject(42), "42");
  });

  await t.test("formats boolean input", () => {
    assert.strictEqual(formatObject(true), "true");
  });

  await t.test("formats Error input", () => {
    const err = new Error("test error");
    const result = formatObject(err);
    assert.ok(result.includes("test error"));
    assert.ok(result.includes("message"));
  });

  await t.test("formats object input", () => {
    const result = formatObject({ key: "value" });
    assert.ok(result.includes("key"));
    assert.ok(result.includes("value"));
  });

  await t.test("returns empty string for null", () => {
    assert.strictEqual(formatObject(null), "");
  });

  await t.test("returns empty string for undefined", () => {
    assert.strictEqual(formatObject(undefined), "");
  });

  await t.test("returns empty string for empty object", () => {
    assert.strictEqual(formatObject({}), "");
  });

  await t.test("formats nested objects", () => {
    const result = formatObject({ a: { b: { c: 1 } } });
    assert.ok(result.includes("c"));
    assert.ok(result.includes("1"));
  });
});

test("createLogger", async (t) => {
  await t.test("returns logger with expected methods", () => {
    const logger = createLogger("test");
    assert.strictEqual(typeof logger.info, "function");
    assert.strictEqual(typeof logger.error, "function");
    assert.strictEqual(typeof logger.warn, "function");
    assert.strictEqual(typeof logger.debug, "function");
  });

  await t.test("accepts custom log level", () => {
    const logger = createLogger("test", "debug");
    assert.ok(logger);
    assert.strictEqual(logger.level, "debug");
  });
});
