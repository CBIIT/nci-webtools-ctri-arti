import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite/vector";
import * as schema from "database/schema.js";
import { seedDatabase } from "database/schema.js";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseDir = resolve(__dirname, "../../database");
const migrationsFolder = resolve(databaseDir, "migrations");
const initSql = readFileSync(resolve(databaseDir, "init.sql"), "utf-8");

export async function createTestDb() {
  const client = new PGlite("memory://", { extensions: { pg_trgm, vector } });
  const db = drizzle({ client, schema });
  await client.exec(initSql);
  await migrate(db, { migrationsFolder });
  return { db, schema, close: () => client.close() };
}

export async function createSeededTestDb() {
  const { db, schema, close } = await createTestDb();
  await seedDatabase(db);
  return { db, schema, close };
}
