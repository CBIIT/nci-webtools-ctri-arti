import db, { User, Model, Usage } from "database";
import assert from "node:assert";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";
import { trackModelUsage } from "gateway/usage.js";

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

  await t.test("creates usage record with correct cost", async () => {
    const initialRemaining = testUser.remaining;

    const usageData = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    };

    const record = await trackModelUsage(testUser.id, "mock-model", "127.0.0.1", usageData);
    assert.ok(record, "Should create a usage record");
    assert.strictEqual(record.userID, testUser.id);
    assert.strictEqual(record.modelID, testModel.id);
    assert.strictEqual(record.inputTokens, 1000);
    assert.strictEqual(record.outputTokens, 500);
    assert.ok(record.cost >= 0, "Cost should be non-negative");

    // Verify cost calculation: (1000/1000 * cost1kInput) + (500/1000 * cost1kOutput)
    const expectedCost =
      (1000 / 1000) * testModel.cost1kInput + (500 / 1000) * testModel.cost1kOutput;
    assert.ok(
      Math.abs(record.cost - expectedCost) < 0.0001,
      `Expected cost ~${expectedCost}, got ${record.cost}`
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
