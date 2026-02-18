import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Sequelize } from "sequelize";

import { loadCsv } from "./csv-loader.js";
import logger from "./logger.js";
import { createModels } from "../database/schema/schema.js";

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

const seedDir = resolve(dirname(fileURLToPath(import.meta.url)), "../database/seeds");

async function seedDatabase() {
  // ============================================================
  // Production seed data (loaded from CSV)
  // ============================================================
  const roles = loadCsv(resolve(seedDir, "roles.csv"));
  const providers = loadCsv(resolve(seedDir, "providers.csv"));
  const modelRows = loadCsv(resolve(seedDir, "models.csv"));
  const prompts = loadCsv(resolve(seedDir, "prompts.csv"));
  const agents = loadCsv(resolve(seedDir, "agents.csv"));

  await models.Role.bulkCreate(roles, { updateOnDuplicate: ["name", "displayOrder"] });
  await models.Provider.bulkCreate(providers, { updateOnDuplicate: ["name", "endpoint"] });
  await models.Model.bulkCreate(modelRows, {
    updateOnDuplicate: [
      "providerId",
      "name",
      "description",
      "internalName",
      "type",
      "summarizeThreshold",
      "cost1kInput",
      "cost1kOutput",
      "cost1kCacheRead",
      "cost1kCacheWrite",
      "maxContext",
      "maxOutput",
      "maxReasoning",
      "defaultParameters",
    ],
  });
  // Seed prompts before agents (agents reference prompts via promptId)
  await models.Prompt.bulkCreate(prompts, {
    updateOnDuplicate: ["name", "version", "content"],
  });
  await models.Agent.bulkCreate(agents, {
    updateOnDuplicate: ["name", "promptId"],
  });

  // ============================================================
  // Test data seeding - comment out for production
  // ============================================================
  const testPolicies = loadCsv(resolve(seedDir, "dummy-policies.csv"));
  const testTools = loadCsv(resolve(seedDir, "dummy-tools.csv"));
  const testRolePolicies = loadCsv(resolve(seedDir, "dummy-role-policies.csv"));
  const testUsers = loadCsv(resolve(seedDir, "dummy-users.csv"));
  const testPrompts = loadCsv(resolve(seedDir, "dummy-prompts.csv"));
  const testAgents = loadCsv(resolve(seedDir, "dummy-agents.csv"));
  const testUserAgents = loadCsv(resolve(seedDir, "dummy-user-agents.csv"));
  const testUserTools = loadCsv(resolve(seedDir, "dummy-user-tools.csv"));
  const testAgentTools = loadCsv(resolve(seedDir, "dummy-agent-tools.csv"));
  const testConversations = loadCsv(resolve(seedDir, "dummy-conversations.csv"));
  const testMessages = loadCsv(resolve(seedDir, "dummy-messages.csv"));
  const testResources = loadCsv(resolve(seedDir, "dummy-resources.csv"));
  const testVectors = loadCsv(resolve(seedDir, "dummy-vectors.csv"));
  const testUsage = loadCsv(resolve(seedDir, "dummy-usage.csv"));

  // Base tables
  await models.Policy.bulkCreate(testPolicies, {
    updateOnDuplicate: ["name", "resource", "action"],
  });
  await models.Tool.bulkCreate(testTools, { updateOnDuplicate: ["name", "type", "endpoint"] });

  // RolePolicy (depends on Role, Policy)
  await models.RolePolicy.bulkCreate(testRolePolicies, {
    updateOnDuplicate: ["roleId", "policyId"],
  });

  // User (depends on Role)
  await models.User.bulkCreate(testUsers, { updateOnDuplicate: ["email"] });

  // Prompt (agentId can be null)
  await models.Prompt.bulkCreate(testPrompts, { updateOnDuplicate: ["name", "version"] });

  // Agent (depends on Model, Prompt)
  await models.Agent.bulkCreate(testAgents, { updateOnDuplicate: ["name", "modelParameters"] });

  // Junction tables (depend on User, Agent, Tool)
  await models.UserAgent.bulkCreate(testUserAgents, {
    updateOnDuplicate: ["userId", "agentId"],
  });
  await models.UserTool.bulkCreate(testUserTools, { updateOnDuplicate: ["userId", "toolId"] });
  await models.AgentTool.bulkCreate(testAgentTools, {
    updateOnDuplicate: ["agentId", "toolId"],
  });

  // Conversation (depends on User, Agent)
  await models.Conversation.bulkCreate(testConversations, { updateOnDuplicate: ["id"] });

  // Message (depends on Conversation)
  await models.Message.bulkCreate(testMessages, {
    updateOnDuplicate: ["conversationId", "serialNumber"],
  });

  // Resource (depends on Agent, Conversation, Message)
  await models.Resource.bulkCreate(testResources, { updateOnDuplicate: ["id"] });

  // Vector (depends on Agent, Resource, Conversation)
  await models.Vector.bulkCreate(testVectors, { updateOnDuplicate: ["id"] });

  // Usage (depends on User, Agent, Message, Model)
  await models.Usage.bulkCreate(testUsage, { updateOnDuplicate: ["id"] });

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
        budget: 1000,
        remaining: 1000,
      },
    });
  }
}

// Sync and seed database (skip for microservices that don't need to manage schema)
if (DB_SKIP_SYNC !== "true") {
  const syncOptions = DB_DIALECT === "sqlite" ? { force: false } : { alter: true };
  await db.sync(syncOptions);
  await seedDatabase();
}

export const {
  KnowledgeBase,
  Resource,
  Vector,
  Prompt,
  Message,
  Conversation,
  Agent,
  Model,
  Provider,
  User,
  UserAgent,
  UserTool,
  AgentTool,
  Tool,
  Usage,
  Role,
  Policy,
  RolePolicy,
  Session,
  Thread,
  MCP,
  UserMCP,
} = models;
export default db;
