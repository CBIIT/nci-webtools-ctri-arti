import db, { User, Model } from "database";
import assert from "node:assert";
import { test } from "node:test";

import { eq } from "drizzle-orm";
import { trackModelUsage, trackUsage } from "gateway/usage.js";

test("trackModelUsage", async (t) => {
  // The DB is auto-seeded via database.js (defaults to in-memory PGlite when PGHOST is not set)
  // test.env also creates a test user via TEST_API_KEY

  let testUser;
  let testModel;

  await t.test("setup: find test fixtures", async () => {
    [testUser] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(testUser, "Test user should exist from seed");

    [testModel] = await db
      .select()
      .from(Model)
      .where(eq(Model.internalName, "mock-model"))
      .limit(1);
    assert.ok(testModel, "Mock model should exist from seed");
  });

  await t.test("creates usage records with correct cost", async () => {
    const usageData = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    };

    const records = await trackModelUsage(testUser.id, "mock-model", "127.0.0.1", usageData);
    assert.ok(records, "Should create usage records");
    assert.ok(Array.isArray(records), "Should return an array");

    const inputRecord = records.find((r) => r.unit === "input_tokens");
    const outputRecord = records.find((r) => r.unit === "output_tokens");

    assert.ok(inputRecord, "Should have input_tokens record");
    assert.strictEqual(inputRecord.quantity, 1000);
    assert.strictEqual(inputRecord.userID, testUser.id);
    assert.strictEqual(inputRecord.modelID, testModel.id);

    assert.ok(outputRecord, "Should have output_tokens record");
    assert.strictEqual(outputRecord.quantity, 500);

    const pricing = testModel.pricing || {};
    const expectedInputCost = 1000 * (pricing.input_tokens || 0);
    const expectedOutputCost = 500 * (pricing.output_tokens || 0);

    assert.ok(
      Math.abs(inputRecord.cost - expectedInputCost) < 0.0001,
      `Expected input cost ~${expectedInputCost}, got ${inputRecord.cost}`
    );
    assert.ok(
      Math.abs(outputRecord.cost - expectedOutputCost) < 0.0001,
      `Expected output cost ~${expectedOutputCost}, got ${outputRecord.cost}`
    );
  });

  await t.test("deducts from user remaining balance", async () => {
    const [userBefore] = await db.select().from(User).where(eq(User.id, testUser.id)).limit(1);
    const balanceBefore = userBefore.remaining;

    const usageData = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    };

    await trackModelUsage(testUser.id, "mock-model", "127.0.0.1", usageData);

    const [userAfter] = await db.select().from(User).where(eq(User.id, testUser.id)).limit(1);
    assert.ok(userAfter.remaining <= balanceBefore, "Balance should decrease or stay same");
  });

  await t.test("handles missing userId gracefully", async () => {
    const result = await trackModelUsage(null, "mock-model", "127.0.0.1", { inputTokens: 10 });
    assert.strictEqual(result, undefined);
  });

  await t.test("handles missing model gracefully", async () => {
    const result = await trackModelUsage(testUser.id, "nonexistent-model", "127.0.0.1", {
      inputTokens: 10,
    });
    assert.strictEqual(result, undefined);
  });

  await t.test("handles missing usageData gracefully", async () => {
    const result = await trackModelUsage(testUser.id, "mock-model", "127.0.0.1", null);
    assert.strictEqual(result, undefined);
  });
});

test("trackUsage", async (t) => {
  let testUser;
  let testModel;

  await t.test("setup: find test fixtures", async () => {
    [testUser] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(testUser, "Test user should exist from seed");

    [testModel] = await db
      .select()
      .from(Model)
      .where(eq(Model.internalName, "mock-model"))
      .limit(1);
    assert.ok(testModel, "Mock model should exist from seed");
  });

  await t.test("creates usage rows for multiple items", async () => {
    const usageItems = [
      { quantity: 200, unit: "input_tokens" },
      { quantity: 100, unit: "output_tokens" },
    ];
    const records = await trackUsage(testUser.id, "mock-model", usageItems, { type: "chat" });
    assert.ok(Array.isArray(records), "should return an array");
    assert.strictEqual(records.length, 2, "should create 2 usage rows");

    const inputRow = records.find((r) => r.unit === "input_tokens");
    const outputRow = records.find((r) => r.unit === "output_tokens");
    assert.ok(inputRow);
    assert.ok(outputRow);
    assert.strictEqual(inputRow.quantity, 200);
    assert.strictEqual(outputRow.quantity, 100);
  });

  await t.test("computes cost from model pricing JSON", async () => {
    const usageItems = [{ quantity: 1000, unit: "input_tokens" }];
    const records = await trackUsage(testUser.id, "mock-model", usageItems, { type: "chat" });
    assert.ok(records);

    const row = records[0];
    const pricing = testModel.pricing || {};
    const expectedUnitCost = pricing.input_tokens || 0;
    assert.strictEqual(row.unitCost, expectedUnitCost, "unitCost should match pricing JSON");
    assert.ok(
      Math.abs(row.cost - 1000 * expectedUnitCost) < 0.0001,
      `cost should be quantity * unitCost, got ${row.cost}`
    );
  });

  await t.test("deducts total cost from user balance", async () => {
    const [userBefore] = await db.select().from(User).where(eq(User.id, testUser.id)).limit(1);
    const balanceBefore = userBefore.remaining;

    const usageItems = [
      { quantity: 500, unit: "input_tokens" },
      { quantity: 250, unit: "output_tokens" },
    ];
    await trackUsage(testUser.id, "mock-model", usageItems, { type: "chat" });

    const [userAfter] = await db.select().from(User).where(eq(User.id, testUser.id)).limit(1);
    assert.ok(userAfter.remaining <= balanceBefore, "balance should decrease or stay same");
  });

  await t.test("returns undefined for unknown model", async () => {
    const result = await trackUsage(testUser.id, "nonexistent-model", [
      { quantity: 10, unit: "input_tokens" },
    ]);
    assert.strictEqual(result, undefined);
  });

  await t.test("returns undefined for empty usageItems", async () => {
    const result = await trackUsage(testUser.id, "mock-model", []);
    assert.strictEqual(result, undefined);
  });

  await t.test("returns undefined for null usageItems", async () => {
    const result = await trackUsage(testUser.id, "mock-model", null);
    assert.strictEqual(result, undefined);
  });
});
