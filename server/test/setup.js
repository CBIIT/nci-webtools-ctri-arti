import { createModels, seedDatabase } from "database/schema.js";
import { Sequelize } from "sequelize";

export async function createTestDb() {
  const db = new Sequelize({ dialect: "sqlite", storage: ":memory:", logging: false });
  const models = createModels(db);
  await db.sync({ force: true });
  return { db, models };
}

export async function createSeededTestDb() {
  const { db, models } = await createTestDb();
  await seedDatabase(models);
  return { db, models };
}
