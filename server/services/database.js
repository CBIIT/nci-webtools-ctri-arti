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
  name: DataTypes.STRING,
  apiKey: DataTypes.STRING,
});

export const Model = db.define("Model", {
  providerId: DataTypes.INTEGER,
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
Role.belongsTo(User, { foreignKey: "roleId" });
Model.belongsTo(Provider, { foreignKey: "providerId" });
Usage.belongsTo(User, { foreignKey: "userId" });
Usage.belongsTo(Model, { foreignKey: "modelId" });
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
    { id: 1, name: "bedrock", apiKey: null }, // uses IAM role
    { id: 2, name: "google", apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY },
    { id: 3, name: "azure", apiKey: process.env.AZURE_API_KEY },
    { id: 4, name: "openai", apiKey: process.env.OPENAI_API_KEY },
    { id: 5, name: "openrouter", apiKey: process.env.OPENROUTER_API_KEY },
  ],
  { updateOnDuplicate: ["name"] } // don't overwrite apiKey
);

await Model.bulkCreate(
  [
    {
      id: 1,
      providerId: 1,
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
      providerId: 1,
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
      providerId: 2,
      label: "Gemini 2.5 Pro",
      value: "gemini-2.5-pro-preview-05-06",
      cost1kInput: 0.0025,
      cost1kOutput: 0.015,
      isReasoner: true,
      maxContext: 1_048_576,
      maxOutput: 65_536,
      maxReasoning: 1_000_000,
    },
    {
      id: 4,
      providerId: 2,
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
      "providerId",
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
