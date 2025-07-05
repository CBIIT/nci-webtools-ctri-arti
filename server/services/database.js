import { Sequelize } from "sequelize";
import logger from "./logger.js";
import { createModels, seedDatabase } from "./schema.js";

const { 
  DB_DIALECT = 'postgres',
  PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD 
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
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  }
};

// Create database instance with selected dialect
const db = new Sequelize(dbConfigs[DB_DIALECT]);
const models = createModels(db);

// Sync and seed database
await db.sync({ alter: true });
await seedDatabase(models);

export const { User, Role, Provider, Model, Usage } = models;
export default db;