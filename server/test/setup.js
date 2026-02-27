import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "database/schema.js";
import { seedDatabase } from "database/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(__dirname, "../../database/migrations");

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  return { db, schema, close: () => client.close() };
}

export async function createSeededTestDb() {
  const { db, schema, close } = await createTestDb();
  await seedDatabase(db);
  return { db, schema, close };
}
