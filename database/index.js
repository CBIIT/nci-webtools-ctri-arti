import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import logger from "shared/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "migrations");

const {
  DB_DIALECT = "postgres",
  DB_STORAGE,
  DB_SKIP_SYNC = "false",
  PGHOST,
  PGPORT,
  PGDATABASE,
  PGUSER,
  PGPASSWORD,
} = process.env;

let db;

// Always use the same PG schema
const schema = await import("./schema.js");

if (DB_DIALECT === "pglite") {
  // PGlite mode (local dev / tests) — embedded PostgreSQL via WASM
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const client = new PGlite(DB_STORAGE || undefined);
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
  User, Role, Policy, RolePolicy,
  Provider, Model,
  Prompt, Agent, Conversation, Message,
  Tool, Resource, Vector,
  UserAgent, UserTool, AgentTool,
  Usage,
} = schema;

export default db;
