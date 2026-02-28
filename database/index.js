import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { sql } from "drizzle-orm";
import logger from "shared/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "migrations");

const {
  DB_STORAGE,
  DB_SKIP_SYNC = "false",
  PGHOST,
  PGPORT,
  PGDATABASE,
  PGUSER,
  PGPASSWORD,
  DB_SSL,
} = process.env;

let db;

// Always use the same PG schema
const schema = await import("./schema.js");

const usePg = !!PGHOST;

if (!usePg) {
  // PGlite mode — embedded PostgreSQL (in-memory by default, or persistent with DB_STORAGE)
  const storage = DB_STORAGE || "memory://";
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  if (!storage.startsWith("memory://")) mkdirSync(storage, { recursive: true });
  const client = new PGlite(storage);
  db = drizzle({ client, schema });

  if (DB_SKIP_SYNC !== "true") {
    await migrate(db, { migrationsFolder });

    const { seedDatabase } = schema;
    await seedDatabase(db);
  }
} else {
  // PostgreSQL mode (production)
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");

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
    await migrate(db, { migrationsFolder });

    const { seedDatabase } = schema;
    await seedDatabase(db);
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
