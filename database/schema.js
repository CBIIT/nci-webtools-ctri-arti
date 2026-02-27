import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { DataTypes } from "sequelize";

import { loadCsv } from "./csv-loader.js";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "data");

// Model definitions as plain objects
export const modelDefinitions = {
  User: {
    attributes: {
      email: DataTypes.STRING,
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      status: DataTypes.STRING,
      roleID: DataTypes.INTEGER,
      apiKey: DataTypes.STRING,
      budget: DataTypes.FLOAT,
      remaining: DataTypes.FLOAT,
    },
    options: {
      indexes: [{ fields: ["email"] }, { fields: ["roleID"] }],
    },
  },

  Role: {
    attributes: {
      name: DataTypes.STRING,
      displayOrder: DataTypes.INTEGER,
    },
    options: {
      indexes: [{ fields: ["displayOrder"] }],
    },
  },

  Policy: {
    attributes: {
      name: DataTypes.STRING,
      resource: DataTypes.STRING,
      action: DataTypes.STRING,
    },
    options: {},
  },

  RolePolicy: {
    attributes: {
      roleID: DataTypes.INTEGER,
      policyID: DataTypes.INTEGER,
    },
    options: {
      indexes: [{ fields: ["roleID", "policyID"], unique: true }],
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
      providerID: DataTypes.INTEGER,
      name: DataTypes.STRING,
      internalName: DataTypes.STRING,
      type: DataTypes.STRING,
      description: DataTypes.STRING,
      maxContext: DataTypes.INTEGER,
      maxOutput: DataTypes.INTEGER,
      maxReasoning: DataTypes.INTEGER,
      cost1kInput: DataTypes.FLOAT,
      cost1kOutput: DataTypes.FLOAT,
      cost1kCacheRead: DataTypes.FLOAT,
      cost1kCacheWrite: DataTypes.FLOAT,
      defaultParameters: DataTypes.JSON,
    },
    options: {
      indexes: [{ fields: ["internalName"] }, { fields: ["providerID"] }],
    },
  },

  Usage: {
    attributes: {
      userID: DataTypes.INTEGER,
      modelID: DataTypes.INTEGER,
      type: DataTypes.STRING,
      agentID: DataTypes.INTEGER,
      messageID: DataTypes.INTEGER,
      inputTokens: DataTypes.FLOAT,
      outputTokens: DataTypes.FLOAT,
      cacheReadTokens: DataTypes.FLOAT,
      cacheWriteTokens: DataTypes.FLOAT,
      cost: DataTypes.FLOAT,
    },
    options: {
      indexes: [
        { fields: ["userID"] },
        { fields: ["modelID"] },
        { fields: ["createdAt"] },
        { fields: ["userID", "createdAt"] },
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
      userID: DataTypes.INTEGER,
      modelID: DataTypes.INTEGER,
      name: DataTypes.STRING,
      description: DataTypes.STRING,
      promptID: DataTypes.INTEGER,
      modelParameters: DataTypes.JSON,
    },
    options: {
      indexes: [
        { fields: ["userID"] },
        { fields: ["modelID"] },
        { fields: ["promptID"] },
      ],
    },
  },

  Tool: {
    attributes: {
      name: DataTypes.STRING,
      description: DataTypes.STRING,
      type: DataTypes.STRING,
      authenticationType: DataTypes.STRING,
      endpoint: DataTypes.STRING,
      transportType: DataTypes.STRING,
      customConfig: DataTypes.JSON,
    },
    options: {},
  },

  Conversation: {
    attributes: {
      userID: DataTypes.INTEGER,
      agentID: DataTypes.INTEGER,
      title: DataTypes.STRING,
      deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      deletedAt: DataTypes.DATE,
      summaryMessageID: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    options: {
      indexes: [
        { fields: ["agentID"] },
        { fields: ["userID", "createdAt"] },
        { fields: ["deleted"] },
      ],
    },
  },

  Message: {
    attributes: {
      conversationID: DataTypes.INTEGER,
      parentID: DataTypes.INTEGER,
      role: DataTypes.STRING,
      content: DataTypes.JSON,
    },
    options: {
      indexes: [
        { fields: ["conversationID"] },
        { fields: ["conversationID", "createdAt"] },
      ],
    },
  },

  Resource: {
    attributes: {
      agentID: DataTypes.INTEGER,
      messageID: DataTypes.INTEGER,
      name: DataTypes.STRING,
      type: DataTypes.STRING,
      content: DataTypes.TEXT,
      s3Uri: DataTypes.STRING,
      metadata: DataTypes.JSON,
    },
    options: {
      indexes: [
        { fields: ["agentID"] },
        { fields: ["messageID"] },
      ],
    },
  },

  Vector: {
    attributes: {
      conversationID: DataTypes.INTEGER,
      resourceID: DataTypes.INTEGER,
      toolID: DataTypes.INTEGER,
      order: DataTypes.INTEGER,
      content: DataTypes.TEXT,
      embedding: DataTypes.JSON,
    },
    options: {
      indexes: [
        { fields: ["conversationID"] },
        { fields: ["toolID"] },
        { fields: ["resourceID", "order"] },
      ],
    },
  },

  UserAgent: {
    attributes: {
      userID: DataTypes.INTEGER,
      agentID: DataTypes.INTEGER,
      role: DataTypes.STRING,
    },
    options: {
      indexes: [{ fields: ["userID", "agentID"], unique: true }],
    },
  },

  UserTool: {
    attributes: {
      userID: DataTypes.INTEGER,
      toolID: DataTypes.INTEGER,
      credential: DataTypes.JSON,
    },
    options: {
      indexes: [{ fields: ["userID", "toolID"], unique: true }],
    },
  },

  AgentTool: {
    attributes: {
      toolID: DataTypes.INTEGER,
      agentID: DataTypes.INTEGER,
    },
    options: {
      indexes: [{ fields: ["toolID", "agentID"], unique: true }],
    },
  },
};

// Association definitions
export const associations = [
  // User -> Role
  { source: "User", target: "Role", type: "belongsTo", options: { foreignKey: "roleID" } },
  { source: "Role", target: "User", type: "hasMany", options: { foreignKey: "roleID" } },

  // RolePolicy join
  { source: "RolePolicy", target: "Role", type: "belongsTo", options: { foreignKey: "roleID" } },
  { source: "RolePolicy", target: "Policy", type: "belongsTo", options: { foreignKey: "policyID" } },
  { source: "Role", target: "RolePolicy", type: "hasMany", options: { foreignKey: "roleID" } },
  { source: "Policy", target: "RolePolicy", type: "hasMany", options: { foreignKey: "policyID" } },

  // Model -> Provider
  { source: "Model", target: "Provider", type: "belongsTo", options: { foreignKey: "providerID" } },

  // Usage
  { source: "Usage", target: "User", type: "belongsTo", options: { foreignKey: "userID" } },
  { source: "Usage", target: "Model", type: "belongsTo", options: { foreignKey: "modelID" } },
  { source: "Usage", target: "Agent", type: "belongsTo", options: { foreignKey: "agentID" } },
  { source: "Usage", target: "Message", type: "belongsTo", options: { foreignKey: "messageID" } },
  { source: "User", target: "Usage", type: "hasMany", options: { foreignKey: "userID" } },
  { source: "Model", target: "Usage", type: "hasMany", options: { foreignKey: "modelID" } },

  // Agent -> Prompt (agent's active prompt)
  { source: "Agent", target: "Prompt", type: "belongsTo", options: { foreignKey: "promptID" } },
  { source: "Prompt", target: "Agent", type: "hasMany", options: { foreignKey: "promptID" } },

  // Agent -> User
  { source: "Agent", target: "User", type: "belongsTo", options: { foreignKey: "userID" } },
  { source: "User", target: "Agent", type: "hasMany", options: { foreignKey: "userID" } },

  // Conversation
  { source: "Conversation", target: "User", type: "belongsTo", options: { foreignKey: "userID" } },
  { source: "Conversation", target: "Agent", type: "belongsTo", options: { foreignKey: "agentID", onDelete: "SET NULL" } },
  { source: "Agent", target: "Conversation", type: "hasMany", options: { foreignKey: "agentID" } },

  // Message -> Conversation
  { source: "Message", target: "Conversation", type: "belongsTo", options: { foreignKey: "conversationID" } },
  { source: "Conversation", target: "Message", type: "hasMany", options: { foreignKey: "conversationID" } },

  // Resource
  { source: "Resource", target: "Agent", type: "belongsTo", options: { foreignKey: "agentID" } },
  { source: "Resource", target: "Message", type: "belongsTo", options: { foreignKey: "messageID" } },

  // Vector
  { source: "Vector", target: "Conversation", type: "belongsTo", options: { foreignKey: "conversationID" } },
  { source: "Vector", target: "Resource", type: "belongsTo", options: { foreignKey: "resourceID" } },
  { source: "Vector", target: "Tool", type: "belongsTo", options: { foreignKey: "toolID" } },
  { source: "Conversation", target: "Vector", type: "hasMany", options: { foreignKey: "conversationID" } },
  { source: "Agent", target: "Resource", type: "hasMany", options: { foreignKey: "agentID" } },

  // UserAgent join
  { source: "UserAgent", target: "User", type: "belongsTo", options: { foreignKey: "userID" } },
  { source: "UserAgent", target: "Agent", type: "belongsTo", options: { foreignKey: "agentID", onDelete: "CASCADE" } },
  { source: "User", target: "UserAgent", type: "hasMany", options: { foreignKey: "userID" } },
  { source: "Agent", target: "UserAgent", type: "hasMany", options: { foreignKey: "agentID" } },

  // UserTool join
  { source: "UserTool", target: "User", type: "belongsTo", options: { foreignKey: "userID" } },
  { source: "UserTool", target: "Tool", type: "belongsTo", options: { foreignKey: "toolID" } },
  { source: "User", target: "UserTool", type: "hasMany", options: { foreignKey: "userID" } },
  { source: "Tool", target: "UserTool", type: "hasMany", options: { foreignKey: "toolID" } },

  // AgentTool join
  { source: "AgentTool", target: "Agent", type: "belongsTo", options: { foreignKey: "agentID", onDelete: "CASCADE" } },
  { source: "AgentTool", target: "Tool", type: "belongsTo", options: { foreignKey: "toolID" } },
  { source: "Agent", target: "AgentTool", type: "hasMany", options: { foreignKey: "agentID" } },
  { source: "Tool", target: "AgentTool", type: "hasMany", options: { foreignKey: "toolID" } },
];

// Helper function to create models from definitions
export function createModels(sequelize) {
  const models = {};

  // Create all models
  for (const [modelName, definition] of Object.entries(modelDefinitions)) {
    models[modelName] = sequelize.define(modelName, definition.attributes, {
      ...definition.options,
      freezeTableName: true,
    });
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
  const policies = loadCsv(resolve(dataDir, "policies.csv"));
  const rolePolicies = loadCsv(resolve(dataDir, "role-policies.csv"));
  const providers = loadCsv(resolve(dataDir, "providers.csv"));
  const modelRows = loadCsv(resolve(dataDir, "models.csv"));
  const prompts = loadCsv(resolve(dataDir, "prompts.csv"));
  const agents = loadCsv(resolve(dataDir, "agents.csv"));
  const tools = loadCsv(resolve(dataDir, "tools.csv"));
  const agentTools = loadCsv(resolve(dataDir, "agent-tools.csv"));

  await models.Role.bulkCreate(roles, { updateOnDuplicate: ["name", "displayOrder"] });
  await models.Policy.bulkCreate(policies, { updateOnDuplicate: ["name", "resource", "action"] });
  await models.RolePolicy.bulkCreate(rolePolicies, { updateOnDuplicate: ["roleID", "policyID"] });
  await models.Provider.bulkCreate(providers, { updateOnDuplicate: ["name"] });
  await models.Model.bulkCreate(modelRows, {
    updateOnDuplicate: [
      "providerID",
      "name",
      "internalName",
      "type",
      "cost1kInput",
      "cost1kOutput",
      "cost1kCacheRead",
      "cost1kCacheWrite",
      "maxContext",
      "maxOutput",
      "maxReasoning",
    ],
  });
  // Seed prompts before agents (agents reference prompts via promptID)
  await models.Prompt.bulkCreate(prompts, { updateOnDuplicate: ["name", "version", "content"] });
  await models.Agent.bulkCreate(agents, { updateOnDuplicate: ["name", "promptID"] });
  await models.Tool.bulkCreate(tools, { updateOnDuplicate: ["name", "description", "type"] });
  await models.AgentTool.bulkCreate(agentTools, { updateOnDuplicate: ["agentID", "toolID"] });

  // Create test admin user if TEST_API_KEY is set
  if (process.env.TEST_API_KEY) {
    await models.User.findOrCreate({
      where: { email: "test@test.com" },
      defaults: {
        firstName: "Test",
        lastName: "Admin",
        status: "active",
        roleID: 1,
        apiKey: process.env.TEST_API_KEY,
        budget: 1000,
        remaining: 1000,
      },
    });
  }
}
