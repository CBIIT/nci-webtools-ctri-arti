import { DataTypes } from "sequelize";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { loadCsv } from "./csv-loader.js";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../data");

// Model definitions as plain objects
export const modelDefinitions = {
  User: {
    attributes: {
      email: DataTypes.STRING,
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      status: DataTypes.STRING,
      roleId: DataTypes.INTEGER,
      apiKey: DataTypes.STRING,
      limit: DataTypes.FLOAT,
      remaining: DataTypes.FLOAT,
    },
    options: {
      indexes: [{ fields: ["email"] }, { fields: ["roleId"] }],
    },
  },

  Role: {
    attributes: {
      name: DataTypes.STRING,
      policy: DataTypes.JSON,
      order: DataTypes.INTEGER,
    },
    options: {
      indexes: [{ fields: ["order"] }],
    },
  },

  Provider: {
    attributes: {
      name: DataTypes.STRING,
      apiKey: DataTypes.STRING,
      endpoint: DataTypes.STRING,
    },
    options: {},
  },

  Model: {
    attributes: {
      providerId: DataTypes.INTEGER,
      name: DataTypes.STRING,
      internalName: DataTypes.STRING,
      maxContext: DataTypes.INTEGER,
      maxOutput: DataTypes.INTEGER,
      maxReasoning: DataTypes.INTEGER,
      cost1kInput: DataTypes.FLOAT,
      cost1kOutput: DataTypes.FLOAT,
      cost1kCacheRead: DataTypes.FLOAT,
      cost1kCacheWrite: DataTypes.FLOAT,
    },
    options: {
      indexes: [{ fields: ["internalName"] }, { fields: ["providerId"] }],
    },
  },

  Usage: {
    attributes: {
      userId: DataTypes.INTEGER,
      modelId: DataTypes.INTEGER,
      ip: DataTypes.STRING,
      inputTokens: DataTypes.FLOAT,
      outputTokens: DataTypes.FLOAT,
      cacheReadTokens: DataTypes.FLOAT,
      cacheWriteTokens: DataTypes.FLOAT,
      cost: DataTypes.FLOAT,
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["modelId"] },
        { fields: ["createdAt"] },
        { fields: ["userId", "createdAt"] },
      ],
    },
  },

  Prompt: {
    attributes: {
      name: DataTypes.STRING,
      version: DataTypes.INTEGER,
      content: DataTypes.TEXT,
    },
    options: {
      indexes: [
        { fields: ["name"] },
        { fields: ["name", "version"], unique: true },
      ],
    },
  },

  Agent: {
    attributes: {
      userId: DataTypes.INTEGER,
      modelId: DataTypes.INTEGER,
      name: DataTypes.STRING,
      promptId: DataTypes.INTEGER,
      tools: DataTypes.JSON,
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["modelId"] },
        { fields: ["promptId"] },
      ],
    },
  },

  Thread: {
    attributes: {
      agentId: DataTypes.INTEGER,
      name: DataTypes.STRING,
      summary: DataTypes.TEXT,
    },
    options: {
      indexes: [
        { fields: ["agentId"] },
        { fields: ["userId", "createdAt"] },
      ],
    },
  },

  Message: {
    attributes: {
      userId: DataTypes.INTEGER,
      threadId: DataTypes.INTEGER,
      role: DataTypes.STRING,
      content: DataTypes.JSON,
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["threadId"] },
        { fields: ["threadId", "createdAt"] },
      ],
    },
  },

  Resource: {
    attributes: {
      userId: DataTypes.INTEGER,
      agentId: DataTypes.INTEGER,
      threadId: DataTypes.INTEGER,
      messageId: DataTypes.INTEGER,
      name: DataTypes.STRING,
      type: DataTypes.STRING,
      content: DataTypes.TEXT,
      s3Uri: DataTypes.STRING,
      metadata: DataTypes.JSON,
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["agentId"] },
        { fields: ["threadId"] },
      ],
    },
  },

  Vector: {
    attributes: {
      userId: DataTypes.INTEGER,
      threadId: DataTypes.INTEGER,
      agentId: DataTypes.INTEGER,
      resourceId: DataTypes.INTEGER,
      order: DataTypes.INTEGER,
      text: DataTypes.TEXT,
      embedding: DataTypes.JSON,
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["threadId"] },
        { fields: ["agentId"] },
        { fields: ["resourceId", "order"] },
      ],
    },
  },
};

// Association definitions
export const associations = [
  { source: "User", target: "Role", type: "belongsTo", options: { foreignKey: "roleId" } },
  { source: "Model", target: "Provider", type: "belongsTo", options: { foreignKey: "providerId" } },
  { source: "Usage", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "Usage", target: "Model", type: "belongsTo", options: { foreignKey: "modelId" } },
  { source: "User", target: "Usage", type: "hasMany", options: { foreignKey: "userId" } },
  { source: "Model", target: "Usage", type: "hasMany", options: { foreignKey: "modelId" } },

  // Prompt associations
  { source: "Agent", target: "Prompt", type: "belongsTo", options: { foreignKey: "promptId" } },
  { source: "Prompt", target: "Agent", type: "hasMany", options: { foreignKey: "promptId" } },

  // Agent associations
  { source: "Agent", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "User", target: "Agent", type: "hasMany", options: { foreignKey: "userId" } },

  // Thread associations
  { source: "Thread", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "Thread", target: "Agent", type: "belongsTo", options: { foreignKey: "agentId" } },
  { source: "Agent", target: "Thread", type: "hasMany", options: { foreignKey: "agentId" } },

  // Message associations
  { source: "Message", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "User", target: "Message", type: "hasMany", options: { foreignKey: "userId" } },
  { source: "Message", target: "Thread", type: "belongsTo", options: { foreignKey: "threadId" } },
  { source: "Thread", target: "Message", type: "hasMany", options: { foreignKey: "threadId" } },

  // Resource associations
  { source: "Resource", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "User", target: "Resource", type: "hasMany", options: { foreignKey: "userId" } },
  { source: "Resource", target: "Thread", type: "belongsTo", options: { foreignKey: "threadId" } },
  { source: "Resource", target: "Message", type: "belongsTo", options: { foreignKey: "messageId" } },

  // Vector associations
  { source: "Vector", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "User", target: "Vector", type: "hasMany", options: { foreignKey: "userId" } },
  { source: "Vector", target: "Thread", type: "belongsTo", options: { foreignKey: "threadId" } },
  { source: "Vector", target: "Resource", type: "belongsTo", options: { foreignKey: "resourceId" } },
  { source: "Thread", target: "Vector", type: "hasMany", options: { foreignKey: "threadId" } },
];

// Helper function to create models from definitions
export function createModels(sequelize) {
  const models = {};

  // Create all models
  for (const [modelName, definition] of Object.entries(modelDefinitions)) {
    models[modelName] = sequelize.define(modelName, definition.attributes, definition.options);
  }

  // Set up associations
  for (const association of associations) {
    const sourceModel = models[association.source];
    const targetModel = models[association.target];
    sourceModel[association.type](targetModel, association.options);
  }

  return models;
}

// Helper function to seed database
export async function seedDatabase(models) {
  const roles = loadCsv(resolve(dataDir, "roles.csv"));
  const providers = loadCsv(resolve(dataDir, "providers.csv"));
  const modelRows = loadCsv(resolve(dataDir, "models.csv"));
  const prompts = loadCsv(resolve(dataDir, "prompts.csv"));
  const agents = loadCsv(resolve(dataDir, "agents.csv"));

  await models.Role.bulkCreate(roles, { updateOnDuplicate: ["name", "policy", "order"] });
  await models.Provider.bulkCreate(providers, { updateOnDuplicate: ["name"] });
  await models.Model.bulkCreate(modelRows, {
    updateOnDuplicate: [
      "providerId",
      "name",
      "internalName",
      "cost1kInput",
      "cost1kOutput",
      "cost1kCacheRead",
      "cost1kCacheWrite",
      "maxContext",
      "maxOutput",
      "maxReasoning",
    ],
  });
  // Seed prompts before agents (agents reference prompts via promptId)
  await models.Prompt.bulkCreate(prompts, { updateOnDuplicate: ["name", "version", "content"] });
  await models.Agent.bulkCreate(agents, { updateOnDuplicate: ["name", "tools", "promptId"] });

  // Create test admin user if TEST_API_KEY is set
  if (process.env.TEST_API_KEY) {
    await models.User.findOrCreate({
      where: { email: "test@test.com" },
      defaults: {
        firstName: "Test",
        lastName: "Admin",
        status: "active",
        roleId: 1,
        apiKey: process.env.TEST_API_KEY,
        limit: 1000,
        remaining: 1000,
      },
    });
  }
}
