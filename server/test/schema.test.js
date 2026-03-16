import assert from "node:assert";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite/vector";
import { auditRelationalIntegrity } from "database/relational-audit.js";
import * as schema from "database/schema.js";
import { getResultRows, pushSchema } from "database/sync.js";

import { createTestDb, createSeededTestDb } from "./setup.js";

test("schema exports", async (t) => {
  await t.test("contains all expected table exports", () => {
    const expectedTables = [
      "User", "Role", "Policy", "RolePolicy",
      "Provider", "Model", "Usage",
      "Prompt", "Guardrail", "Agent", "Conversation", "Message",
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
    assert.ok(Object.keys(schema.tables).length >= 18);
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

  await t.test("seeds guardrails", async () => {
    const { db, schema: s, close } = await createSeededTestDb();
    const guardrails = await db.select().from(s.Guardrail);
    assert.ok(guardrails.length >= 1, `Expected at least 1 guardrail, got ${guardrails.length}`);
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

test("relational audit", async (t) => {
  await t.test("reports a clean relational graph on the migrated schema", async () => {
    const { db, close } = await createSeededTestDb();
    const audit = await auditRelationalIntegrity(db);

    assert.equal(
      audit.missingForeignKeys.length,
      0,
      `expected all required foreign keys to exist, found: ${JSON.stringify(audit.missingForeignKeys)}`
    );
    assert.deepStrictEqual(
      audit.orphanedRows.filter((entry) => entry.count > 0),
      [],
      "seeded fixtures should not contain orphaned rows"
    );
    assert.deepStrictEqual(
      audit.nullableViolations.filter((entry) => entry.count > 0),
      [],
      "seeded fixtures should satisfy the required-column rules"
    );

    await close();
  });

  await t.test("rejects new orphaned rows after the foreign keys land", async () => {
    const { db, schema: s, close } = await createTestDb();
    await assert.rejects(
      db.insert(s.Message).values({
        conversationID: 999999,
        role: "user",
        content: [{ type: "text", text: "orphan" }],
      }),
      /Failed query/i
    );

    await close();
  });
});

test("pushSchema", async (t) => {
  await t.test("applies the same modern schema shape as the checked-in migrations", async () => {
    const client = new PGlite("memory://", { extensions: { pg_trgm, vector } });

    try {
      await pushSchema((statement) => client.exec(statement));

      const usageColumns = await client.query(`
        select column_name
        from information_schema.columns
        where table_name = 'Usage'
        order by ordinal_position
      `);
      const usageColumnNames = usageColumns.rows.map((row) => row.column_name);

      assert.ok(usageColumnNames.includes("quantity"));
      assert.ok(usageColumnNames.includes("unit"));
      assert.ok(usageColumnNames.includes("unitCost"));
      assert.ok(!usageColumnNames.includes("inputTokens"));
      assert.ok(!usageColumnNames.includes("outputTokens"));

      const agentColumns = await client.query(`
        select column_name
        from information_schema.columns
        where table_name = 'Agent'
        order by ordinal_position
      `);
      const agentColumnNames = agentColumns.rows.map((row) => row.column_name);
      assert.ok(agentColumnNames.includes("guardrailID"));

      const [embeddingColumn] = (
        await client.query(`
          select udt_name
          from information_schema.columns
          where table_name = 'Vector' and column_name = 'embedding'
        `)
      ).rows;

      assert.equal(embeddingColumn.udt_name, "vector");
    } finally {
      await client.close();
    }
  });
});

test("getResultRows", async (t) => {
  await t.test("unwraps PGlite exec SELECT results into row objects", async () => {
    const client = new PGlite("memory://", { extensions: { pg_trgm, vector } });

    try {
      await client.exec(`CREATE TABLE "Migration" ("name" text PRIMARY KEY)`);
      await client.exec(`INSERT INTO "Migration" ("name") VALUES ('0000_init.sql')`);

      const result = await client.exec(`SELECT "name" FROM "Migration"`);
      assert.deepStrictEqual(getResultRows(result), [{ name: "0000_init.sql" }]);
    } finally {
      await client.close();
    }
  });

  await t.test("passes through postgres-style row arrays unchanged", () => {
    const rows = [{ name: "0000_init.sql" }];
    assert.deepStrictEqual(getResultRows(rows), rows);
  });
});
