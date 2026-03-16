import assert from "node:assert";
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite/vector";
import { auditRelationalIntegrity } from "database/relational-audit.js";
import * as schema from "database/schema.js";
import { seedDatabase } from "database/schema.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseDir = resolve(__dirname, "../../database");
const migrationsDir = resolve(databaseDir, "migrations");
const initSql = readFileSync(resolve(databaseDir, "init.sql"), "utf-8");

function splitStatements(sqlText) {
  return sqlText
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyMigrations(client, predicate) {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .filter(predicate);

  for (const file of files) {
    const sqlText = readFileSync(resolve(migrationsDir, file), "utf-8");
    for (const statement of splitStatements(sqlText)) {
      await client.exec(statement);
    }
  }
}

test("relational migrations repair dirty historical rows before enforcing foreign keys", async () => {
  const client = new PGlite("memory://", { extensions: { pg_trgm, vector } });
  const db = drizzle({ client, schema });

  try {
    await client.exec(initSql);
    await applyMigrations(
      client,
      (file) => file <= "0009_vector_embeddings.sql" || file === "0013_guardrails.sql"
    );
    await seedDatabase(db);

    const [validUser] = await db
      .insert(schema.User)
      .values({ email: "owner@example.org", roleID: 2, budget: 100, remaining: 100 })
      .returning();
    const [validAgent] = await db
      .insert(schema.Agent)
      .values({
        userID: validUser.id,
        modelID: 1,
        promptID: 1,
        name: "Private Agent",
      })
      .returning();
    const [validConversation] = await db
      .insert(schema.Conversation)
      .values({ userID: validUser.id, agentID: validAgent.id, title: "chat" })
      .returning();
    const [validMessage] = await db
      .insert(schema.Message)
      .values({
        conversationID: validConversation.id,
        role: "user",
        content: [{ type: "text", text: "hello" }],
      })
      .returning();

    const [backfillResource] = await db
      .insert(schema.Resource)
      .values({
        userID: null,
        agentID: null,
        conversationID: null,
        messageID: validMessage.id,
        name: "uploads/hello.txt",
        type: "file",
        content: "hello world",
      })
      .returning();

    const [backfillVector] = await db
      .insert(schema.Vector)
      .values({
        resourceID: backfillResource.id,
        conversationID: null,
        toolID: null,
        order: 0,
        content: "hello world",
      })
      .returning();

    await db.insert(schema.User).values({ email: "broken-role@example.org", roleID: 999999 });
    await db.insert(schema.Agent).values({ userID: 999999, name: "Orphan Agent" });
    await db.insert(schema.Conversation).values({ userID: null, title: "orphan conversation" });
    await db.insert(schema.Message).values({
      conversationID: 999999,
      role: "user",
      content: [{ type: "text", text: "orphan" }],
    });
    await db.insert(schema.Resource).values({
      userID: 999999,
      name: "private/leak.txt",
      type: "file",
      content: "remove me",
    });
    await db.insert(schema.Vector).values({
      resourceID: 999999,
      conversationID: validConversation.id,
      toolID: 999999,
      order: 0,
      content: "stale vector",
    });
    await db.insert(schema.AgentTool).values({ agentID: 999999, toolID: 1 });
    await db.insert(schema.UserTool).values({ userID: validUser.id, toolID: 999999 });
    await db.insert(schema.UserAgent).values({ userID: validUser.id, agentID: 999999 });
    await client.exec(`
      insert into "Usage" ("userID", "modelID", "type", "agentID", "messageID", "quantity", "unit", "unitCost", "cost")
      values (${validUser.id}, 999999, null, 999999, 999999, 1, 'input_tokens', 0, 0)
    `);

    await applyMigrations(
      client,
      (file) =>
        file >= "0010_repair_relational_integrity.sql" && file < "0013_guardrails.sql"
    );

    const audit = await auditRelationalIntegrity(db);
    assert.equal(audit.missingForeignKeys.length, 0);
    assert.deepStrictEqual(audit.orphanedRows.filter((entry) => entry.count > 0), []);
    assert.deepStrictEqual(audit.nullableViolations.filter((entry) => entry.count > 0), []);

    const [repairedResource] = await db
      .select()
      .from(schema.Resource)
      .where(eq(schema.Resource.id, backfillResource.id));
    assert.equal(repairedResource.userID, validUser.id);
    assert.equal(repairedResource.agentID, validAgent.id);
    assert.equal(repairedResource.conversationID, validConversation.id);
    assert.equal(repairedResource.messageID, validMessage.id);

    const [repairedVector] = await db
      .select()
      .from(schema.Vector)
      .where(eq(schema.Vector.id, backfillVector.id));
    assert.equal(repairedVector.conversationID, validConversation.id);
    assert.equal(repairedVector.resourceID, backfillResource.id);

    const orphanAgent = await db
      .select()
      .from(schema.Agent)
      .where(eq(schema.Agent.name, "Orphan Agent"));
    assert.equal(orphanAgent.length, 0);

    const leakedResource = await db
      .select()
      .from(schema.Resource)
      .where(eq(schema.Resource.name, "private/leak.txt"));
    assert.equal(leakedResource.length, 0);

    const [usage] = await db.select().from(schema.Usage);
    assert.equal(usage.modelID, null);
    assert.equal(usage.agentID, null);
    assert.equal(usage.messageID, null);

    await assert.rejects(
      db.insert(schema.Message).values({
        conversationID: 999999,
        role: "user",
        content: [{ type: "text", text: "bad" }],
      }),
      /Failed query/i
    );
    await assert.rejects(
      db.insert(schema.Conversation).values({
        userID: null,
        title: "missing owner",
      }),
      /Failed query/i
    );
  } finally {
    await client.close();
  }
});
