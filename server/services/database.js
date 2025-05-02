import { Sequelize, DataTypes } from "sequelize";
import logger from "./logger.js";

// use implicit connection parameters (eg: PGHOST)
const db = new Sequelize({ dialect: "postgres", logging: m => logger.info(m) }); 

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
Role.hasMany(User, { foreignKey: "roleId" });

export const Model = db.define("Model", {
  provider: DataTypes.STRING,
  label: DataTypes.STRING,
  value: DataTypes.STRING,
  cost1kInput: DataTypes.FLOAT,
  cost1kOutput: DataTypes.FLOAT,
});

export const Usage = db.define("Usage", {
  userId: DataTypes.INTEGER,
  modelId: DataTypes.INTEGER,
  inputTokens: DataTypes.FLOAT,
  outputTokens: DataTypes.FLOAT,
});

User.hasMany(Usage, { foreignKey: "userId" });
Model.hasMany(Usage, { foreignKey: "modelId" });

await db.sync({ alter: true });

if (!await Role.count()) {
  await Role.bulkCreate([
    { name: "admin", policy: [{ actions: "*", resources: "*" }] },
    { name: "user", policy: null },
  ]);
}

if (!await Model.count()) {
  await Model.bulkCreate([
    { provider: "bedrock", label: "Sonnet 3.7", value: "us.anthropic.claude-3-7-sonnet-20250219-v1:0", cost1kInput: 0.003, cost1kOutput: 0.015 },
    { provider: "bedrock", label: "Haiku 3.5", value: "us.anthropic.claude-3-5-haiku-20241022-v1:0", cost1kInput: 0.0008, cost1kOutput: 0.004 },
    { provider: "google", label: "Gemini 2.5 Pro", value: "gemini-2.5-pro-preview-03-25", cost1kInput: 0.0025, cost1kOutput: 0.015 },
    { provider: "google", label: "Gemini 2.5 Flash", value: "gemini-2.5-flash-preview-04-17", cost1kInput: 0.00015, cost1kOutput: 0.0035 },
  ]);
}

export default db;
