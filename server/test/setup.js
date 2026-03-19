import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { vector } from "@electric-sql/pglite/vector";
import * as schema from "database/schema.js";
import { seedDatabase } from "database/schema.js";
import { pushSchema } from "database/sync.js";
import { drizzle } from "drizzle-orm/pglite";

export async function createTestDb() {
  const client = new PGlite("memory://", { extensions: { pg_trgm, vector } });
  const db = drizzle({ client, schema });
  await pushSchema((statement) => client.exec(statement));
  return { db, schema, close: () => client.close() };
}

export async function createSeededTestDb() {
  const { db, schema, close } = await createTestDb();
  await seedDatabase(db);
  return { db, schema, close };
}
