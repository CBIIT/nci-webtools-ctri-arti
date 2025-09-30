import { DataTypes } from "sequelize";

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
    },
    options: {},
  },

  Model: {
    attributes: {
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
    },
    options: {
      indexes: [{ fields: ["value"] }, { fields: ["providerId"] }],
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
};

// Association definitions
export const associations = [
  { source: "User", target: "Role", type: "belongsTo", options: { foreignKey: "roleId" } },
  { source: "Model", target: "Provider", type: "belongsTo", options: { foreignKey: "providerId" } },
  { source: "Usage", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "Usage", target: "Model", type: "belongsTo", options: { foreignKey: "modelId" } },
  { source: "User", target: "Usage", type: "hasMany", options: { foreignKey: "userId" } },
  { source: "Model", target: "Usage", type: "hasMany", options: { foreignKey: "modelId" } },
];

// Default seed data
export const seedData = {
  roles: [
    { id: 1, name: "admin", policy: [{ actions: "*", resources: "*" }], order: 2 },
    { id: 2, name: "super user", policy: [{ actions: "*", resources: "dev" }], order: 1 },
    { id: 3, name: "user", policy: null, order: 0 },
  ],

  providers: [
    { id: 1, name: "bedrock", apiKey: null },
    { id: 2, name: "google", apiKey: process.env.GEMINI_API_KEY },
    { id: 99, name: "mock", apiKey: null },
  ],

  models: [
    {
      id: 1,
      providerId: 1,
      label: "Opus 4.1",
      value: "us.anthropic.claude-opus-4-1-20250805-v1:0",
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
      label: "Sonnet 4.5",
      value: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      cost1kInput: 0.003,
      cost1kOutput: 0.015,
      cost1kCacheRead: 0.0003,
      cost1kCacheWrite: 0.00375,
      maxContext: 1_000_000,
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
      id: 6,
      providerId: 1,
      label: "Sonnet 3.7",
      value: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      cost1kInput: 0.003,
      cost1kOutput: 0.015,
      cost1kCacheRead: 0.0003,
      cost1kCacheWrite: 0.00375,
      maxContext: 200_000,
      maxOutput: 64_000,
      maxReasoning: 60_000,
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
    {
      id: 99,
      providerId: 99,
      label: "Mock Model",
      value: "mock-model",
      cost1kInput: 0.0000001,
      cost1kOutput: 0.0000005,
      cost1kCacheRead: 0.00000001,
      cost1kCacheWrite: 0.00000012,
      maxContext: 1_000_000,
      maxOutput: 100_000,
      maxReasoning: 500_000,
    },
  ],
};

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
  await models.Role.bulkCreate(seedData.roles, { updateOnDuplicate: ["name", "policy", "order"] });
  await models.Provider.bulkCreate(seedData.providers, { updateOnDuplicate: ["name"] });
  await models.Model.bulkCreate(seedData.models, {
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
  });
}
