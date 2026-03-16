import { mkdirSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { sql } from "drizzle-orm";
import logger from "shared/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "migrations");
const initSql = readFileSync(resolve(__dirname, "init.sql"), "utf-8");

const {
  DB_STORAGE,
  DB_SKIP_SYNC = "false",
  DB_SKIP_AUDIT = "false",
  PGHOST,
  PGPORT,
  PGDATABASE,
  PGUSER,
  PGPASSWORD,
  DB_SSL,
} = process.env;

async function runMigrations(execFn) {
  // Create tracking table first (idempotent)
  await execFn(`CREATE TABLE IF NOT EXISTS "Migration" (
    "name" text PRIMARY KEY,
    "appliedAt" timestamp DEFAULT now()
  )`);

  // Query already-applied migrations
  const result = await execFn(`SELECT "name" FROM "Migration"`);
  const applied = new Set(
    (Array.isArray(result) ? result : (result?.rows ?? [])).map((r) => r.name)
  );

  const migrationFiles = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    if (applied.has(file)) continue;

    const migrationSql = readFileSync(resolve(migrationsFolder, file), "utf-8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await execFn(stmt);
    }
    await execFn(`INSERT INTO "Migration" ("name") VALUES ('${file}')`);
    logger.info(`migration applied: ${file}`);
  }
}

async function ensureRelationalIntegrity(db) {
  if (DB_SKIP_AUDIT === "true") return;

  const { auditRelationalIntegrity } = await import("./relational-audit.js");
  const audit = await auditRelationalIntegrity(db);
  const orphaned = audit.orphanedRows.filter((entry) => entry.count > 0);
  const nullable = audit.nullableViolations.filter((entry) => entry.count > 0);

  if (audit.missingForeignKeys.length || orphaned.length || nullable.length) {
    throw new Error(
      [
        "Relational integrity audit failed after database sync.",
        `missingForeignKeys=${JSON.stringify(audit.missingForeignKeys)}`,
        `orphanedRows=${JSON.stringify(orphaned)}`,
        `nullableViolations=${JSON.stringify(nullable)}`,
      ].join(" ")
    );
  }
}

let db;

// Always use the same PG schema
const schema = await import("./schema.js");

const usePg = !!PGHOST;

if (!usePg) {
  // PGlite mode — embedded PostgreSQL (in-memory by default, or persistent with DB_STORAGE)
  const storage = DB_STORAGE || "memory://";
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");

  if (!storage.startsWith("memory://")) mkdirSync(storage, { recursive: true });
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const { vector } = await import("@electric-sql/pglite/vector");
  const client = new PGlite(storage, { extensions: { pg_trgm, vector } });
  db = drizzle({ client, schema });

  if (DB_SKIP_SYNC !== "true") {
    // Run init SQL (extensions, etc.) before migrations — PGlite can't do this via prepared statements
    await client.exec(initSql);

    await runMigrations((stmt) => client.exec(stmt));

    const { seedDatabase } = schema;
    await seedDatabase(db);
    await ensureRelationalIntegrity(db);
  }
} else {
  // PostgreSQL mode (production)
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");

  const sql = postgres({
    host: PGHOST,
    port: +PGPORT,
    database: PGDATABASE,
    username: PGUSER,
    password: PGPASSWORD,
    ssl: DB_SSL === "1" ? { rejectUnauthorized: false } : false,
    onnotice: () => {},
  });
  db = drizzle(sql, { schema });

  if (DB_SKIP_SYNC !== "true") {
    // Run init SQL (extensions, etc.) before migrations
    await sql.unsafe(initSql);

    await runMigrations((stmt) => sql.unsafe(stmt));

    const { seedDatabase } = schema;
    await seedDatabase(db);
    await ensureRelationalIntegrity(db);
  }
}

export const {
  User,
  Role,
  Policy,
  RolePolicy,
  Provider,
  Model,
  Prompt,
  Guardrail,
  Agent,
  Conversation,
  Message,
  Tool,
  Resource,
  Vector,
  UserAgent,
  UserTool,
  AgentTool,
  Usage,
  Session,
} = schema;

/**
 * Tagged template for raw SQL that returns rows as an array.
 * Normalizes the result format across postgres-js (returns array)
 * and PGlite (returns { rows: [...] }).
 *
 * Usage: const rows = await rawSql`SELECT * FROM "User" WHERE id = ${id}`;
 */
export function rawSql(strings, ...values) {
  const query = sql(strings, ...values);
  return db.execute(query).then((result) => (Array.isArray(result) ? result : (result.rows ?? [])));
}

export default db;
