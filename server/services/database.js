import { Sequelize, DataTypes } from "sequelize";
import logger from "./logger.js";
const { PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD } = process.env;

const db = new Sequelize({
  dialect: "postgres",
  logging: (m) => logger.info(m),
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
});

export const Provider = db.define("Provider", {
  name: { type: DataTypes.STRING, primaryKey: true },
  apiKey: DataTypes.STRING,
});

export const Model = db.define("Model", {
  provider: DataTypes.STRING,
  label: DataTypes.STRING,
  value: DataTypes.STRING,
  isReasoner: DataTypes.BOOLEAN,
  maxContext: DataTypes.INTEGER,
  maxOutput: DataTypes.INTEGER,
  maxReasoning: DataTypes.INTEGER,
  cost1kInput: DataTypes.FLOAT,
  cost1kOutput: DataTypes.FLOAT,
});

export const Usage = db.define("Usage", {
  userId: DataTypes.INTEGER,
  modelId: DataTypes.INTEGER,
  ip: DataTypes.STRING,
  inputTokens: DataTypes.FLOAT,
  outputTokens: DataTypes.FLOAT,
});

await db.sync({ alter: true });
Role.hasMany(User, { foreignKey: "roleId" });
Provider.hasMany(Model, { foreignKey: "provider" });
User.hasMany(Usage, { foreignKey: "userId" });
Model.hasMany(Usage, { foreignKey: "modelId" });
await db.sync({ alter: true });

await Role.bulkCreate(
  [
    { id: 1, name: "admin", policy: [{ actions: "*", resources: "*" }] },
    { id: 2, name: "pro", policy: [{ actions: "invoke:unlimited", resources: "*" }] },
    { id: 3, name: "user", policy: null },
  ],
  { updateOnDuplicate: ["name", "policy"] }
);

await Provider.bulkCreate(
  [
    { name: "bedrock", apiKey: null },
    { name: "google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY },
  ],
  { updateOnDuplicate: ["name", "apiKey"] }
);

// TODO: fetch models from providers
await Model.bulkCreate(
  [
    {
      id: 1,
      provider: "bedrock",
      label: "Sonnet 3.7",
      value: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      cost1kInput: 0.003,
      cost1kOutput: 0.015,
      isReasoner: true,
      maxContext: 200_000,
      maxOutput: 64_000,
      maxReasoning: 60_000,
    },
    {
      id: 2,
      provider: "bedrock",
      label: "Haiku 3.5",
      value: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
      cost1kInput: 0.0008,
      cost1kOutput: 0.004,
      isReasoner: false,
      maxContext: 200_000,
      maxOutput: 8192,
      maxReasoning: 0,
    },
    {
      id: 3,
      provider: "google",
      label: "Gemini 2.5 Pro",
      value: "gemini-2.5-pro-preview-03-25",
      cost1kInput: 0.0025,
      cost1kOutput: 0.015,
      isReasoner: true,
      maxContext: 1_048_576,
      maxOutput: 65_536,
      maxReasoning: 1_000_000,
    },
    {
      id: 4,
      provider: "google",
      label: "Gemini 2.5 Flash",
      value: "gemini-2.5-flash-preview-04-17",
      cost1kInput: 0.00015,
      cost1kOutput: 0.0035,
      isReasoner: true,
      maxContext: 1_048_576,
      maxOutput: 65_536,
      maxReasoning: 1_000_000,
    },
  ],
  {
    updateOnDuplicate: [
      "provider",
      "label",
      "value",
      "cost1kInput",
      "cost1kOutput",
      "isReasoner",
      "maxContext",
      "maxOutput",
      "maxReasoning",
    ],
  }
);

export default db;
