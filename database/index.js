import { Sequelize } from "sequelize";

import logger from "shared/logger.js";
import { createModels, seedDatabase } from "./schema.js";

const {
  DB_DIALECT = "postgres",
  DB_STORAGE = ":memory:",
  DB_SKIP_SYNC = "false",
  PGHOST,
  PGPORT,
  PGDATABASE,
  PGUSER,
  PGPASSWORD,
} = process.env;

const dbConfigs = {
  postgres: {
    dialect: "postgres",
    logging: (m) => logger.debug(m),
    host: PGHOST,
    port: +PGPORT,
    database: PGDATABASE,
    username: PGUSER,
    password: PGPASSWORD,
  },
  sqlite: {
    dialect: "sqlite",
    storage: DB_STORAGE,
    logging: (m) => logger.debug(m),
  },
};

// Create database instance with selected dialect
const db = new Sequelize(dbConfigs[DB_DIALECT]);
const models = createModels(db);

// Sync and seed database (skip for microservices that don't need to manage schema)
if (DB_SKIP_SYNC !== "true") {
  const syncOptions = DB_DIALECT === "sqlite" ? { force: false } : { alter: true };
  await db.sync(syncOptions);
  await seedDatabase(models);
}

export const {
  User, Role, Policy, RolePolicy,
  Provider, Model,
  Prompt, Agent, Conversation, Message,
  Tool, Resource, Vector,
  UserAgent, UserTool, AgentTool,
  Usage,
} = models;
export default db;
