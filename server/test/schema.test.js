import assert from "node:assert";
import { test } from "node:test";

import * as schema from "database/schema.js";

import { createTestDb, createSeededTestDb } from "./setup.js";

test("schema exports", async (t) => {
  await t.test("contains all expected table exports", () => {
    const expectedTables = [
      "User", "Role", "Policy", "RolePolicy",
      "Provider", "Model", "Usage",
      "Prompt", "Agent", "Conversation", "Message",
      "Tool", "Resource", "Vector",
      "UserAgent", "UserTool", "AgentTool",
    ];
    for (const name of expectedTables) {
      assert.ok(schema[name], `Missing table export: ${name}`);
    }
  });

  await t.test("exports relations", () => {
    assert.ok(schema.userRelations, "Missing userRelations");
    assert.ok(schema.roleRelations, "Missing roleRelations");
    assert.ok(schema.agentRelations, "Missing agentRelations");
  });

  await t.test("exports tables object", () => {
    assert.ok(schema.tables, "Missing tables object");
    assert.ok(Object.keys(schema.tables).length >= 17);
  });
});

test("createTestDb", async (t) => {
  await t.test("creates database with all tables", async () => {
    const { db, schema: s, close } = await createTestDb();
    // Should be able to select from every table without error
    const tables = Object.values(s.tables || {});
    for (const table of tables) {
      const rows = await db.select().from(table);
      assert.ok(Array.isArray(rows));
    }
    close();
  });
});

test("seedDatabase", async (t) => {
  await t.test("seeds roles", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const roles = await db.select().from(s.Role);
    assert.ok(roles.length >= 3, `Expected at least 3 roles, got ${roles.length}`);
    const roleNames = roles.map((r) => r.name);
    assert.ok(roleNames.includes("admin"));
    assert.ok(roleNames.includes("user"));
    close();
  });

  await t.test("seeds providers", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const providers = await db.select().from(s.Provider);
    assert.ok(providers.length >= 1, `Expected at least 1 provider, got ${providers.length}`);
    close();
  });

  await t.test("seeds models", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const allModels = await db.select().from(s.Model);
    assert.ok(allModels.length >= 1, `Expected at least 1 model, got ${allModels.length}`);
    close();
  });

  await t.test("seeds prompts", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const prompts = await db.select().from(s.Prompt);
    assert.ok(prompts.length >= 1, `Expected at least 1 prompt, got ${prompts.length}`);
    close();
  });

  await t.test("seeds agents", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const agents = await db.select().from(s.Agent);
    assert.ok(agents.length >= 1, `Expected at least 1 agent, got ${agents.length}`);
    close();
  });

  await t.test("seeds policies", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const policies = await db.select().from(s.Policy);
    assert.ok(policies.length >= 1, `Expected at least 1 policy, got ${policies.length}`);
    close();
  });

  await t.test("seeds tools", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const tools = await db.select().from(s.Tool);
    assert.ok(tools.length >= 7, `Expected at least 7 tools, got ${tools.length}`);
    close();
  });

  await t.test("seeds role-policies", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const rolePolicies = await db.select().from(s.RolePolicy);
    assert.ok(rolePolicies.length >= 1, `Expected at least 1 role-policy, got ${rolePolicies.length}`);
    close();
  });

  await t.test("seeds agent-tools", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const agentTools = await db.select().from(s.AgentTool);
    assert.ok(agentTools.length >= 1, `Expected at least 1 agent-tool, got ${agentTools.length}`);
    close();
  });
});
