import assert from "node:assert";
import { test } from "node:test";

import { modelDefinitions, associations, createModels, seedDatabase } from "database/schema.js";

import { createTestDb, createSeededTestDb } from "./setup.js";

test("modelDefinitions", async (t) => {
  await t.test("contains all expected model names", () => {
    const expectedModels = [
      "User", "Role", "Policy", "RolePolicy",
      "Provider", "Model", "Usage",
      "Prompt", "Agent", "Conversation", "Message",
      "Tool", "Resource", "Vector",
      "UserAgent", "UserTool", "AgentTool",
    ];
    for (const name of expectedModels) {
      assert.ok(modelDefinitions[name], `Missing model definition: ${name}`);
      assert.ok(modelDefinitions[name].attributes, `Missing attributes for: ${name}`);
    }
  });
});

test("associations", async (t) => {
  await t.test("is an array with entries", () => {
    assert.ok(Array.isArray(associations));
    assert.ok(associations.length > 0);
  });

  await t.test("contains expected association types", () => {
    const types = new Set(associations.map((a) => a.type));
    assert.ok(types.has("belongsTo"));
    assert.ok(types.has("hasMany"));
  });

  await t.test("all entries have required fields", () => {
    for (const assoc of associations) {
      assert.ok(assoc.source, "Missing source");
      assert.ok(assoc.target, "Missing target");
      assert.ok(assoc.type, "Missing type");
      assert.ok(assoc.options, "Missing options");
    }
  });
});

test("createModels", async (t) => {
  await t.test("creates all expected models", async () => {
    const { db, models } = await createTestDb();
    const expectedModels = Object.keys(modelDefinitions);
    for (const name of expectedModels) {
      assert.ok(models[name], `Missing model: ${name}`);
    }
    await db.close();
  });

  await t.test("sets up associations", async () => {
    const { db, models } = await createTestDb();
    // Verify User has Role association
    const user = models.User.build({ email: "test@test.com", roleID: 1 });
    assert.ok(typeof models.User.associations === "object");
    assert.ok(models.User.associations.Role, "User should have Role association");
    await db.close();
  });
});

test("seedDatabase", async (t) => {
  await t.test("seeds roles", async () => {
    const { db, models } = await createSeededTestDb();
    const roles = await models.Role.findAll();
    assert.ok(roles.length >= 3, `Expected at least 3 roles, got ${roles.length}`);
    const roleNames = roles.map((r) => r.name);
    assert.ok(roleNames.includes("admin"));
    assert.ok(roleNames.includes("user"));
    await db.close();
  });

  await t.test("seeds providers", async () => {
    const { db, models } = await createSeededTestDb();
    const providers = await models.Provider.findAll();
    assert.ok(providers.length >= 1, `Expected at least 1 provider, got ${providers.length}`);
    await db.close();
  });

  await t.test("seeds models", async () => {
    const { db, models } = await createSeededTestDb();
    const allModels = await models.Model.findAll();
    assert.ok(allModels.length >= 1, `Expected at least 1 model, got ${allModels.length}`);
    await db.close();
  });

  await t.test("seeds prompts", async () => {
    const { db, models } = await createSeededTestDb();
    const prompts = await models.Prompt.findAll();
    assert.ok(prompts.length >= 1, `Expected at least 1 prompt, got ${prompts.length}`);
    await db.close();
  });

  await t.test("seeds agents", async () => {
    const { db, models } = await createSeededTestDb();
    const agents = await models.Agent.findAll();
    assert.ok(agents.length >= 1, `Expected at least 1 agent, got ${agents.length}`);
    await db.close();
  });

  await t.test("seeds policies", async () => {
    const { db, models } = await createSeededTestDb();
    const policies = await models.Policy.findAll();
    assert.ok(policies.length >= 1, `Expected at least 1 policy, got ${policies.length}`);
    await db.close();
  });

  await t.test("seeds tools", async () => {
    const { db, models } = await createSeededTestDb();
    const tools = await models.Tool.findAll();
    assert.ok(tools.length >= 7, `Expected at least 7 tools, got ${tools.length}`);
    await db.close();
  });

  await t.test("seeds role-policies", async () => {
    const { db, models } = await createSeededTestDb();
    const rolePolicies = await models.RolePolicy.findAll();
    assert.ok(rolePolicies.length >= 1, `Expected at least 1 role-policy, got ${rolePolicies.length}`);
    await db.close();
  });

  await t.test("seeds agent-tools", async () => {
    const { db, models } = await createSeededTestDb();
    const agentTools = await models.AgentTool.findAll();
    assert.ok(agentTools.length >= 1, `Expected at least 1 agent-tool, got ${agentTools.length}`);
    await db.close();
  });
});
