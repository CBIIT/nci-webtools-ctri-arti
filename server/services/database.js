import { Sequelize, DataTypes } from "sequelize";
import logger from "./logger.js";
const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const db = new Sequelize({
  dialect: "postgres",
  logging: (m) => logger.debug(m),
  host: PGHOST,
  port: +PGPORT,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
});

export const User = db.define("User", {
  email: DataTypes.STRING,
  firstName: DataTypes.STRING,
  lastName: DataTypes.STRING,
  status: DataTypes.STRING,
  roleId: DataTypes.INTEGER,
  apiKey: DataTypes.STRING,
  limit: DataTypes.FLOAT,
  remaining: DataTypes.FLOAT,
});

export const Role = db.define("Role", {
  name: DataTypes.STRING,
  policy: DataTypes.JSON,
  order: DataTypes.INTEGER
});

export const Provider = db.define("Provider", {
  name: DataTypes.STRING,
  apiKey: DataTypes.STRING,
});

export const Model = db.define("Model", {
  providerId: DataTypes.INTEGER,
  label: DataTypes.STRING,
  value: DataTypes.STRING,
  maxContext: DataTypes.INTEGER,
  maxOutput: DataTypes.INTEGER,
  maxReasoning: DataTypes.INTEGER,
  cost1kInput: DataTypes.FLOAT,
  cost1kOutput: DataTypes.FLOAT,
  cost1kCacheRead: DataTypes.FLOAT,
  cost1kCacheWrite: DataTypes.FLOAT,
});

export const Usage = db.define("Usage", {
  userId: DataTypes.INTEGER,
  modelId: DataTypes.INTEGER,
  ip: DataTypes.STRING,
  inputTokens: DataTypes.FLOAT,
  outputTokens: DataTypes.FLOAT,
  cacheReadTokens: DataTypes.FLOAT,
  cacheWriteTokens: DataTypes.FLOAT,
  cost: DataTypes.FLOAT,
});

await db.sync({ alter: true });
User.belongsTo(Role, { foreignKey: "roleId" });
Model.belongsTo(Provider, { foreignKey: "providerId" });
Usage.belongsTo(User, { foreignKey: "userId" });
Usage.belongsTo(Model, { foreignKey: "modelId" });
User.hasMany(Usage, { foreignKey: "userId" });
Model.hasMany(Usage, { foreignKey: "modelId" });
await db.sync({ alter: true });

await Role.bulkCreate(
  [
    { id: 1, name: "admin", policy: [{ actions: "*", resources: "*" }], order: 2 },
    { id: 2, name: "super user", policy: [{ actions: "*", resources: "dev" }], order: 1 },
    { id: 3, name: "user", policy: null, order: 0 },
  ],
  { updateOnDuplicate: ["name", "policy", "order"] }
);

await Provider.bulkCreate(
  [
    { id: 1, name: "bedrock", apiKey: null }, // uses IAM role
    { id: 2, name: "google", apiKey: process.env.GEMINI_API_KEY },
  ],
  { updateOnDuplicate: ["name"] } // don't overwrite apiKey
);

await Model.bulkCreate(
  [
    {
      id: 1,
      providerId: 1,
      label: "Opus 4.0",
      value: "us.anthropic.claude-opus-4-20250514-v1:0",
      cost1kInput: 0.015,
      cost1kOutput: 0.075,
      cost1kCacheRead: 0.0015,
      cost1kCacheWrite: 0.01875,
      maxContext: 200_000,
      maxOutput: 32_000,
      maxReasoning: 30_000,
    },
    {
      id: 2,
      providerId: 1,
      label: "Sonnet 4.0",
      value: "us.anthropic.claude-sonnet-4-20250514-v1:0",
      cost1kInput: 0.003,
      cost1kOutput: 0.015,
      cost1kCacheRead: 0.0003,
      cost1kCacheWrite: 0.00375,
      maxContext: 200_000,
      maxOutput: 64_000,
      maxReasoning: 60_000,
    },
    {
      id: 3,
      providerId: 1,
      label: "Haiku 3.5",
      value: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
      cost1kInput: 0.0008,
      cost1kOutput: 0.004,
      cost1kCacheRead: 0.00008,
      cost1kCacheWrite: 0.001,
      maxContext: 200_000,
      maxOutput: 8192,
      maxReasoning: 0,
    },
    {
      id: 4,
      providerId: 1,
      label: "Maverick",
      value: "us.meta.llama4-maverick-17b-instruct-v1:0",
      cost1kInput: 0.00024,
      cost1kOutput: 0.00097,
      maxContext: 1_000_000,
      maxOutput: 8192,
      maxReasoning: 0,
    },
    {
      id: 5,
      providerId: 1,
      label: "Scout",
      value: "us.meta.llama4-scout-17b-instruct-v1:0",
      cost1kInput: 0.00017,
      cost1kOutput: 0.00066,
      maxContext: 3_500_000,
      maxOutput: 8192,
      maxReasoning: 0,
    },
    {
      id: 10,
      providerId: 2,
      label: "Gemini 2.5 Pro",
      value: "gemini-2.5-pro-preview-06-05",
      cost1kInput: 0.0025,
      cost1kOutput: 0.015,
      maxContext: 1_048_576,
      maxOutput: 65_536,
      maxReasoning: 1_000_000,
    },
    {
      id: 11,
      providerId: 2,
      label: "Gemini 2.5 Flash",
      value: "gemini-2.5-flash-preview-04-17",
      cost1kInput: 0.00015,
      cost1kOutput: 0.0035,
      maxContext: 1_048_576,
      maxOutput: 65_536,
      maxReasoning: 1_000_000,
    },
  ],
  {
    updateOnDuplicate: [
      "providerId",
      "label",
      "value",
      "cost1kInput",
      "cost1kOutput",
      "cost1kCacheRead",
      "cost1kCacheWrite",
      "maxContext",
      "maxOutput",
      "maxReasoning",
    ],

  }
);

export default db;
