import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "database/schema.js";
import { pushSchema } from "database/sync.js";
import { seedDatabase } from "database/schema.js";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await pushSchema((s) => client.exec(s));
  return { db, schema, close: () => client.close() };
}

export async function createSeededTestDb() {
  const { db, schema, close } = await createTestDb();
  await seedDatabase(db);
  return { db, schema, close };
}
