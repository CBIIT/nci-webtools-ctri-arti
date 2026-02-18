import { DataTypes } from "sequelize";

// Model definitions as plain objects
export const modelDefinitions = {
  KnowledgeBase: {
    attributes: {
      name: DataTypes.STRING,
      embeddingModelID: DataTypes.INTEGER,
      rerankingModelID: DataTypes.INTEGER,
      configuration: DataTypes.JSONB,
      description: DataTypes.STRING,
    },
    options: {
      indexes: [{ fields: ["embeddingModelID"] }, { fields: ["rerankingModelID"] }],
    },
  },

  Resource: {
    attributes: {
      knowledgeBaseId: DataTypes.INTEGER,
      name: DataTypes.STRING,
      description: DataTypes.STRING,
      metadata: DataTypes.JSONB,
      s3Url: DataTypes.STRING,
      conversationId: DataTypes.INTEGER,
      mimeType: DataTypes.STRING,
      content: DataTypes.TEXT,
      messageId: DataTypes.INTEGER,
    },
    options: {
      indexes: [
        { fields: ["knowledgeBaseId"] },
        { fields: ["conversationId"] },
        { fields: ["messageId"] },
      ],
    },
  },

  Vector: {
    attributes: {
      knowledgeBaseId: DataTypes.INTEGER,
      resourceId: DataTypes.INTEGER,
      order: DataTypes.INTEGER,
      embedding: DataTypes.JSONB,
      content: DataTypes.TEXT,
      conversationId: DataTypes.INTEGER,
    },
    options: {
      indexes: [
        { fields: ["knowledgeBaseId"] },
        { fields: ["resourceId"] },
        { fields: ["conversationId"] },
        { fields: ["resourceId", "order"] },
      ],
    },
  },

  Prompt: {
    attributes: {
      agentId: DataTypes.INTEGER,
      version: DataTypes.INTEGER,
      content: DataTypes.TEXT,
      name: DataTypes.STRING,
    },
    options: {
      indexes: [
        { fields: ["agentId"] },
        { fields: ["name"] },
        { fields: ["name", "version"], unique: true },
      ],
    },
  },

  Message: {
    attributes: {
      conversationId: DataTypes.INTEGER,
      serialNumber: DataTypes.INTEGER,
      role: DataTypes.ENUM("system", "user", "assistant", "tool"),
      content: DataTypes.JSONB,
      tokens: DataTypes.INTEGER,
    },
    options: {
      indexes: [
        { fields: ["conversationId"] },
        { fields: ["conversationId", "serialNumber"] },
      ],
    },
  },

  Conversation: {
    attributes: {
      agentId: DataTypes.INTEGER,
      userId: DataTypes.INTEGER,
      deleted: DataTypes.BOOLEAN,
      deletedAt: DataTypes.DATE,
      title: DataTypes.STRING,
      latestSummarySN: DataTypes.INTEGER,
    },
    options: {
      indexes: [{ fields: ["agentId"] }, { fields: ["userId"] }, { fields: ["userId", "agentId"] }],
    },
  },

  Agent: {
    attributes: {
      name: DataTypes.STRING,
      description: DataTypes.STRING,
      creatorId: DataTypes.INTEGER,
      modelId: DataTypes.INTEGER,
      promptId: DataTypes.INTEGER,
      // Optional inference parameter overrides (JSON: { temperature, topP, topK })
      modelParameters: DataTypes.JSONB,
    },
    options: {
      indexes: [{ fields: ["creatorId"] }, { fields: ["modelId"] }, { fields: ["promptId"] }],
    },
  },

  Model: {
    attributes: {
      name: DataTypes.STRING,
      description: DataTypes.STRING,
      providerId: DataTypes.INTEGER,
      internalName: DataTypes.STRING,
      type: DataTypes.ENUM("chat", "embedding", "reranking"),
      summarizeThreshold: DataTypes.INTEGER,
      maxContext: DataTypes.INTEGER,
      maxOutput: DataTypes.INTEGER,
      maxReasoning: DataTypes.INTEGER,
      cost1kInput: DataTypes.FLOAT,
      cost1kOutput: DataTypes.FLOAT,
      cost1kCacheRead: DataTypes.FLOAT,
      cost1kCacheWrite: DataTypes.FLOAT,
      // Default inference parameters (JSON: { temperature, topP, topK })
      defaultParameters: DataTypes.JSONB,
    },
    options: {
      indexes: [{ fields: ["internalName"] }, { fields: ["providerId"] }],
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

  User: {
    attributes: {
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      email: DataTypes.STRING,
      roleId: DataTypes.INTEGER,
      status: DataTypes.ENUM("Active", "Inactive", "Disabled"),
      apiKey: DataTypes.STRING,
      budget: DataTypes.FLOAT,
      remaining: DataTypes.FLOAT,
    },
    options: {
      indexes: [{ fields: ["email"] }, { fields: ["roleId"] }],
    },
  },

  UserAgent: {
    attributes: {
      userId: DataTypes.INTEGER,
      agentId: DataTypes.INTEGER,
      role: DataTypes.ENUM("admin", "user"),
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["agentId"] },
        { fields: ["userId", "agentId"], unique: true },
      ],
    },
  },

  UserTool: {
    attributes: {
      userId: DataTypes.INTEGER,
      toolId: DataTypes.INTEGER,
      credential: DataTypes.JSONB,
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["toolId"] },
        { fields: ["userId", "toolId"], unique: true },
      ],
    },
  },

  AgentTool: {
    attributes: {
      agentId: DataTypes.INTEGER,
      toolId: DataTypes.INTEGER,
    },
    options: {
      indexes: [
        { fields: ["agentId"] },
        { fields: ["toolId"] },
        { fields: ["agentId", "toolId"], unique: true },
      ],
    },
  },

  Tool: {
    attributes: {
      name: DataTypes.STRING,
      type: DataTypes.ENUM("MCP", "Custom"),
      authenticationType: DataTypes.STRING,
      endpoint: DataTypes.STRING,
      transportType: DataTypes.STRING,
      customConfig: DataTypes.JSONB,
    },
    options: {},
  },

  Usage: {
    attributes: {
      type: { type: DataTypes.ENUM("user", "agent", "guardrail"), defaultValue: "user" },
      userId: DataTypes.INTEGER,
      agentId: DataTypes.INTEGER,
      messageId: DataTypes.INTEGER,
      modelId: DataTypes.INTEGER,
      inputTokens: DataTypes.FLOAT,
      outputTokens: DataTypes.FLOAT,
      cacheReadTokens: DataTypes.FLOAT,
      cacheWriteTokens: DataTypes.FLOAT,
      cost: DataTypes.FLOAT,
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["agentId"] },
        { fields: ["messageId"] },
        { fields: ["modelId"] },
        { fields: ["createdAt"] },
        { fields: ["userId", "createdAt"] },
        { fields: ["agentId", "createdAt"] },
        { fields: ["type"] },
        { fields: ["type", "createdAt"] },
      ],
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
      roleId: DataTypes.INTEGER,
      policyId: DataTypes.INTEGER,
    },
    options: {
      indexes: [
        { fields: ["roleId"] },
        { fields: ["policyId"] },
        { fields: ["roleId", "policyId"], unique: true },
      ],
    },
  },

  Session: {
    attributes: {
      sid: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      expires: DataTypes.DATE,
      data: DataTypes.TEXT,
    },
    options: {},
  },

  Thread: {
    attributes: {
      agentId: DataTypes.INTEGER,
      name: DataTypes.STRING,
      summary: DataTypes.TEXT,
    },
    options: {
      indexes: [{ fields: ["agentId"] }, { fields: ["userId", "createdAt"] }],
    },
  },

  MCP: {
    attributes: {
      agentId: DataTypes.INTEGER,
      name: DataTypes.STRING,
    },
    options: {
      indexes: [{ fields: ["agentId"] }],
    },
  },

  UserMCP: {
    attributes: {
      userId: DataTypes.INTEGER,
      MCPId: DataTypes.INTEGER,
      credential: DataTypes.BLOB,
    },
    options: {
      indexes: [
        { fields: ["userId"] },
        { fields: ["MCPId"] },
        { fields: ["userId", "MCPId"], unique: true },
      ],
    },
  },
};

// Association definitions
export const associations = [
  // User associations
  { source: "User", target: "Role", type: "belongsTo", options: { foreignKey: "roleId" } },
  { source: "User", target: "UserTool", type: "hasMany", options: { foreignKey: "userId" } },
  { source: "User", target: "Conversation", type: "hasMany", options: { foreignKey: "userId" } },
  { source: "User", target: "Usage", type: "hasMany", options: { foreignKey: "userId" } },

  // Role associations
  { source: "Role", target: "User", type: "hasMany", options: { foreignKey: "roleId" } },
  { source: "Role", target: "RolePolicy", type: "hasMany", options: { foreignKey: "roleId" } },

  // Policy associations
  { source: "Policy", target: "RolePolicy", type: "hasMany", options: { foreignKey: "policyId" } },

  // Agent associations
  { source: "Agent", target: "AgentTool", type: "hasMany", options: { foreignKey: "agentId" } },
  { source: "Agent", target: "Prompt", type: "belongsTo", options: { foreignKey: "promptId" } },
  { source: "Agent", target: "Model", type: "belongsTo", options: { foreignKey: "modelId" } },
  { source: "Agent", target: "Conversation", type: "hasMany", options: { foreignKey: "agentId" } },
  { source: "Agent", target: "Usage", type: "hasMany", options: { foreignKey: "agentId" } },

  // Tool associations
  { source: "Tool", target: "AgentTool", type: "hasMany", options: { foreignKey: "toolId" } },
  { source: "Tool", target: "UserTool", type: "hasMany", options: { foreignKey: "toolId" } },

  // Prompt associations
  { source: "Prompt", target: "Agent", type: "hasMany", options: { foreignKey: "promptId" } },

  // Model associations
  { source: "Model", target: "Agent", type: "hasMany", options: { foreignKey: "modelId" } },
  { source: "Model", target: "Provider", type: "belongsTo", options: { foreignKey: "providerId" } },
  { source: "Model", target: "Usage", type: "hasMany", options: { foreignKey: "modelId" } },

  // Provider associations
  { source: "Provider", target: "Model", type: "hasMany", options: { foreignKey: "providerId" } },

  // Agent -> User (creator) association
  { source: "Agent", target: "User", type: "belongsTo", options: { foreignKey: "creatorId" } },
  { source: "User", target: "Agent", type: "hasMany", options: { foreignKey: "creatorId" } },

  // Conversation associations
  { source: "Conversation", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  {
    source: "Conversation",
    target: "Agent",
    type: "belongsTo",
    options: { foreignKey: "agentId" },
  },
  {
    source: "Conversation",
    target: "Message",
    type: "hasMany",
    options: { foreignKey: "conversationId" },
  },
  {
    source: "Conversation",
    target: "Resource",
    type: "hasMany",
    options: { foreignKey: "conversationId" },
  },
  {
    source: "Conversation",
    target: "Vector",
    type: "hasMany",
    options: { foreignKey: "conversationId" },
  },

  // Message associations
  {
    source: "Message",
    target: "Conversation",
    type: "belongsTo",
    options: { foreignKey: "conversationId" },
  },
  { source: "Message", target: "Resource", type: "hasMany", options: { foreignKey: "messageId" } },
  { source: "Message", target: "Usage", type: "hasMany", options: { foreignKey: "messageId" } },

  // KnowledgeBase associations
  {
    source: "KnowledgeBase",
    target: "Resource",
    type: "hasMany",
    options: { foreignKey: "knowledgeBaseId" },
  },
  {
    source: "KnowledgeBase",
    target: "Vector",
    type: "hasMany",
    options: { foreignKey: "knowledgeBaseId" },
  },

  // Resource associations
  {
    source: "Resource",
    target: "KnowledgeBase",
    type: "belongsTo",
    options: { foreignKey: "knowledgeBaseId" },
  },
  {
    source: "Resource",
    target: "Conversation",
    type: "belongsTo",
    options: { foreignKey: "conversationId" },
  },
  {
    source: "Resource",
    target: "Message",
    type: "belongsTo",
    options: { foreignKey: "messageId" },
  },
  { source: "Resource", target: "Vector", type: "hasMany", options: { foreignKey: "resourceId" } },

  // Vector associations
  {
    source: "Vector",
    target: "KnowledgeBase",
    type: "belongsTo",
    options: { foreignKey: "knowledgeBaseId" },
  },
  {
    source: "Vector",
    target: "Resource",
    type: "belongsTo",
    options: { foreignKey: "resourceId" },
  },
  {
    source: "Vector",
    target: "Conversation",
    type: "belongsTo",
    options: { foreignKey: "conversationId" },
  },

  // Thread associations
  { source: "Thread", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "Thread", target: "Agent", type: "belongsTo", options: { foreignKey: "agentId" } },
  { source: "Agent", target: "Thread", type: "hasMany", options: { foreignKey: "agentId" } },

  // Usage associations
  { source: "Usage", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "Usage", target: "Agent", type: "belongsTo", options: { foreignKey: "agentId" } },
  { source: "Usage", target: "Message", type: "belongsTo", options: { foreignKey: "messageId" } },
  { source: "Usage", target: "Model", type: "belongsTo", options: { foreignKey: "modelId" } },

  // UserAgent associations (use dev's aliased versions)
  {
    source: "User",
    target: "UserAgent",
    type: "hasMany",
    options: { foreignKey: "userId", as: "userAgents" },
  },
  {
    source: "Agent",
    target: "UserAgent",
    type: "hasMany",
    options: { foreignKey: "agentId", as: "userAgents" },
  },
  { source: "UserAgent", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "UserAgent", target: "Agent", type: "belongsTo", options: { foreignKey: "agentId" } },

  // UserTool associations
  { source: "UserTool", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  { source: "UserTool", target: "Tool", type: "belongsTo", options: { foreignKey: "toolId" } },

  // AgentTool associations
  { source: "AgentTool", target: "Agent", type: "belongsTo", options: { foreignKey: "agentId" } },
  { source: "AgentTool", target: "Tool", type: "belongsTo", options: { foreignKey: "toolId" } },

  // RolePolicy associations
  { source: "RolePolicy", target: "Role", type: "belongsTo", options: { foreignKey: "roleId" } },
  {
    source: "RolePolicy",
    target: "Policy",
    type: "belongsTo",
    options: { foreignKey: "policyId" },
  },

  // MCP associations
  {
    source: "Agent",
    target: "MCP",
    type: "hasMany",
    options: { foreignKey: "agentId", as: "mcps" },
  },
  { source: "MCP", target: "Agent", type: "belongsTo", options: { foreignKey: "agentId" } },

  // UserMCP associations
  {
    source: "User",
    target: "UserMCP",
    type: "hasMany",
    options: { foreignKey: "userId", as: "userMCPs" },
  },
  { source: "UserMCP", target: "User", type: "belongsTo", options: { foreignKey: "userId" } },
  {
    source: "MCP",
    target: "UserMCP",
    type: "hasMany",
    options: { foreignKey: "MCPId", as: "userCredentials" },
  },
  { source: "UserMCP", target: "MCP", type: "belongsTo", options: { foreignKey: "MCPId" } },
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
