import { Sequelize } from "sequelize";
import { createModels, seedDatabase } from "../services/schema.js";

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
