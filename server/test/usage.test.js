import "../test-support/db.js";
import db, {
  User,
  Model,
  Agent,
  Conversation,
  Message,
  Resource,
  Usage,
  UserTool,
  UserAgent,
} from "database";
import assert from "node:assert";
import { test } from "node:test";

import { eq } from "drizzle-orm";
import { createGatewayUsage } from "gateway/core/usage.js";
import { createUsersApplication } from "users/app.js";
import { UserService } from "users/user.js";

const users = createUsersApplication();
const { trackModelUsage, trackUsage } = createGatewayUsage({
  recordUsage: (...args) => users.recordUsage(...args),
});

test("trackModelUsage", async (t) => {
  // The DB is auto-seeded via database.js (defaults to in-memory PGlite when PGHOST is not set)
  // test.env also creates a test user via TEST_API_KEY

  let testUser;
  let testModel;
  let guardrailModel;

  await t.test("setup: find test fixtures", async () => {
    [testUser] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(testUser, "Test user should exist from seed");

    [testModel] = await db
      .select()
      .from(Model)
      .where(eq(Model.internalName, "mock-model"))
      .limit(1);
    assert.ok(testModel, "Mock model should exist from seed");

    [guardrailModel] = await db
      .select()
      .from(Model)
      .where(eq(Model.internalName, "aws-guardrails"))
      .limit(1);
    assert.ok(guardrailModel, "AWS Guardrails model should exist from seed");
  });

  await t.test("creates usage records with correct cost", async () => {
    const usageData = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    };

    const records = await trackModelUsage(testUser.id, "mock-model", usageData);
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

    await trackModelUsage(testUser.id, "mock-model", usageData);

    const [userAfter] = await db.select().from(User).where(eq(User.id, testUser.id)).limit(1);
    assert.ok(userAfter.remaining <= balanceBefore, "Balance should decrease or stay same");
  });

  await t.test("records guardrail costs without reducing user budget", async () => {
    const [userBefore] = await db.select().from(User).where(eq(User.id, testUser.id)).limit(1);

    const records = await trackModelUsage(testUser.id, "mock-model", null, {
      requestId: `guardrail-${Date.now()}`,
      trace: {
        guardrail: {
          inputAssessment: {
            input: {
              invocationMetrics: {
                usage: {
                  contentPolicyUnits: 2,
                  topicPolicyUnits: 1,
                  wordPolicyUnits: 4,
                  sensitiveInformationPolicyUnits: 3,
                  contextualGroundingPolicyUnits: 5,
                  contentPolicyImageUnits: 2,
                  automatedReasoningPolicyUnits: 7,
                  automatedReasoningPolicies: 2,
                },
              },
            },
          },
        },
      },
    });

    assert.ok(Array.isArray(records), "Should return guardrail usage rows");
    assert.ok(
      records.every((row) => row.type === "guardrail"),
      "Rows should be marked guardrail"
    );
    assert.ok(
      records.every((row) => row.modelID === guardrailModel.id),
      "Rows should be recorded against AWS Guardrails"
    );
    assert.ok(
      records.some((row) => row.unit === "content_policy_units"),
      "Should record content policy usage"
    );
    assert.ok(
      records.some((row) => row.unit === "automated_reasoning_policy_units" && row.quantity === 14),
      "Should multiply automated reasoning units by policy count"
    );

    const [userAfter] = await db.select().from(User).where(eq(User.id, testUser.id)).limit(1);
    assert.strictEqual(
      userAfter.remaining,
      userBefore.remaining,
      "Guardrail costs should not consume user budget"
    );
  });

  await t.test("handles missing userId gracefully", async () => {
    const result = await trackModelUsage(null, "mock-model", { inputTokens: 10 });
    assert.strictEqual(result, undefined);
  });

  await t.test("handles missing model gracefully", async () => {
    const result = await trackModelUsage(testUser.id, "nonexistent-model", {
      inputTokens: 10,
    });
    assert.strictEqual(result, undefined);
  });

  await t.test("handles missing usageData gracefully", async () => {
    const result = await trackModelUsage(testUser.id, "mock-model", null);
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
    const requestId = `usage-${Date.now()}`;
    const records = await trackUsage(testUser.id, "mock-model", usageItems, {
      type: "chat",
      requestId,
    });
    assert.ok(Array.isArray(records), "should return an array");
    assert.strictEqual(records.length, 2, "should create 2 usage rows");

    const inputRow = records.find((r) => r.unit === "input_tokens");
    const outputRow = records.find((r) => r.unit === "output_tokens");
    assert.ok(inputRow);
    assert.ok(outputRow);
    assert.strictEqual(inputRow.quantity, 200);
    assert.strictEqual(outputRow.quantity, 100);
    assert.strictEqual(inputRow.requestId, requestId);
    assert.strictEqual(outputRow.requestId, requestId);
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

test("UserService billing lifecycle", async (t) => {
  const service = new UserService();

  await t.test("findOrCreateUser initializes limited users with remaining balance", async () => {
    const email = `billing-find-or-create-${Date.now()}-${Math.random()}@test.com`;
    const user = await service.findOrCreateUser({
      email,
      firstName: "Billing",
      lastName: "User",
    });

    assert.strictEqual(user.roleID, 3);
    assert.strictEqual(user.budget, 1);
    assert.strictEqual(user.remaining, 1);
  });

  await t.test("createUser mirrors budget into remaining for limited users", async () => {
    const user = await service.createUser({
      email: `billing-create-${Date.now()}-${Math.random()}@test.com`,
      firstName: "Limited",
      lastName: "User",
      status: "active",
      roleID: 3,
      budget: 7,
    });

    assert.strictEqual(user.budget, 7);
    assert.strictEqual(user.remaining, 7);
  });

  await t.test("createUser keeps unlimited users explicitly unlimited", async () => {
    const user = await service.createUser({
      email: `billing-unlimited-${Date.now()}-${Math.random()}@test.com`,
      firstName: "Unlimited",
      lastName: "User",
      status: "active",
      roleID: 1,
      budget: null,
    });

    assert.strictEqual(user.budget, null);
    assert.strictEqual(user.remaining, null);
  });

  await t.test("updateUser resets remaining when budget changes", async () => {
    const user = await service.createUser({
      email: `billing-update-${Date.now()}-${Math.random()}@test.com`,
      firstName: "Update",
      lastName: "User",
      status: "active",
      roleID: 3,
      budget: 3,
    });

    const updated = await service.updateUser(user.id, { budget: 9 });
    assert.strictEqual(updated.budget, 9);
    assert.strictEqual(updated.remaining, 9);
  });

  await t.test("recordUsage deducts from budget when legacy remaining is null", async () => {
    const [legacyUser] = await db
      .insert(User)
      .values({
        email: `billing-legacy-${Date.now()}-${Math.random()}@test.com`,
        firstName: "Legacy",
        lastName: "User",
        status: "active",
        roleID: 3,
        budget: 2,
        remaining: null,
      })
      .returning();

    await service.recordUsage(legacyUser.id, [
      {
        userID: legacyUser.id,
        modelID: 99,
        type: "chat",
        quantity: 1,
        unit: "input_tokens",
        unitCost: 0.5,
        cost: 0.5,
      },
    ]);

    const [after] = await db.select().from(User).where(eq(User.id, legacyUser.id)).limit(1);
    assert.strictEqual(after.remaining, 1.5);
  });

  await t.test("recordUsage excludes guardrail rows from budget deduction", async () => {
    const user = await service.createUser({
      email: `billing-guardrail-${Date.now()}-${Math.random()}@test.com`,
      firstName: "Guardrail",
      lastName: "User",
      status: "active",
      roleID: 3,
      budget: 2,
    });

    await service.recordUsage(user.id, [
      {
        userID: user.id,
        modelID: 22,
        requestId: `guardrail-${Date.now()}`,
        type: "guardrail",
        quantity: 10,
        unit: "content_policy_units",
        unitCost: 0.1,
        cost: 1,
      },
    ]);

    const [after] = await db.select().from(User).where(eq(User.id, user.id)).limit(1);
    assert.strictEqual(after.remaining, 2);
  });

  await t.test("getAnalytics supports grouping by type", async () => {
    const analyticsUser = await service.createUser({
      email: `analytics-type-${Date.now()}-${Math.random()}@test.com`,
      firstName: "Analytics",
      lastName: "Type",
      status: "active",
      roleID: 3,
      budget: 5,
    });

    await service.recordUsage(analyticsUser.id, [
      {
        userID: analyticsUser.id,
        modelID: 99,
        requestId: "req-chat-1",
        type: "chat",
        quantity: 50,
        unit: "input_tokens",
        unitCost: 0.001,
        cost: 0.05,
      },
      {
        userID: analyticsUser.id,
        modelID: 22,
        requestId: "req-chat-1",
        type: "guardrail",
        quantity: 2,
        unit: "content_policy_units",
        unitCost: 0.00015,
        cost: 0.0003,
      },
    ]);

    const result = await service.getAnalytics({
      groupBy: "type",
      userId: analyticsUser.id,
      startDate: "2000-01-01",
      endDate: "2100-01-01",
    });

    assert.ok(Array.isArray(result.data));
    assert.ok(result.data.some((row) => row.type === "chat"));
    assert.ok(result.data.some((row) => row.type === "guardrail"));
  });
});

test("UserService deleteUser cascades owned chat and billing rows", async () => {
  const service = new UserService();

  const [user] = await db
    .insert(User)
    .values({
      email: "delete-me@example.org",
      roleID: 3,
      budget: 5,
      remaining: 5,
      status: "active",
    })
    .returning();

  const [agent] = await db
    .insert(Agent)
    .values({
      userID: user.id,
      modelID: 1,
      promptID: 1,
      name: "Delete Me Agent",
    })
    .returning();

  const [conversation] = await db
    .insert(Conversation)
    .values({ userID: user.id, agentID: agent.id, title: "delete me" })
    .returning();

  const [message] = await db
    .insert(Message)
    .values({
      conversationID: conversation.id,
      role: "user",
      content: [{ type: "text", text: "cleanup" }],
    })
    .returning();

  await db.insert(Resource).values({
    userID: user.id,
    agentID: agent.id,
    conversationID: conversation.id,
    messageID: message.id,
    name: "delete-me.txt",
    type: "file",
    content: "cleanup",
  });
  await db.insert(Usage).values({
    userID: user.id,
    modelID: 1,
    agentID: agent.id,
    messageID: message.id,
    quantity: 1,
    unit: "input_tokens",
    unitCost: 0,
    cost: 0,
  });
  await db.insert(UserTool).values({ userID: user.id, toolID: 1, credential: { token: "x" } });
  await db.insert(UserAgent).values({ userID: user.id, agentID: agent.id, role: "owner" });

  const result = await service.deleteUser(user.id);
  assert.deepStrictEqual(result, { success: true });

  const [userAfter] = await db.select().from(User).where(eq(User.id, user.id)).limit(1);
  const [agentAfter] = await db.select().from(Agent).where(eq(Agent.id, agent.id)).limit(1);
  const [conversationAfter] = await db
    .select()
    .from(Conversation)
    .where(eq(Conversation.id, conversation.id))
    .limit(1);
  const [messageAfter] = await db.select().from(Message).where(eq(Message.id, message.id)).limit(1);
  const usageRows = await db.select().from(Usage).where(eq(Usage.userID, user.id));
  const resourceRows = await db.select().from(Resource).where(eq(Resource.userID, user.id));
  const userToolRows = await db.select().from(UserTool).where(eq(UserTool.userID, user.id));
  const userAgentRows = await db.select().from(UserAgent).where(eq(UserAgent.userID, user.id));

  assert.equal(userAfter, undefined);
  assert.equal(agentAfter, undefined);
  assert.equal(conversationAfter, undefined);
  assert.equal(messageAfter, undefined);
  assert.equal(usageRows.length, 0);
  assert.equal(resourceRows.length, 0);
  assert.equal(userToolRows.length, 0);
  assert.equal(userAgentRows.length, 0);
});
