import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { relations } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  json,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

import { loadCsv } from "./csv-loader.js";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "data");

// ===== Table Definitions =====

export const User = pgTable(
  "User",
  {
    id: serial("id").primaryKey(),
    email: text("email"),
    firstName: text("firstName"),
    lastName: text("lastName"),
    status: text("status"),
    roleID: integer("roleID"),
    apiKey: text("apiKey"),
    budget: doublePrecision("budget"),
    remaining: doublePrecision("remaining"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("User_email_idx").on(t.email), index("User_roleID_idx").on(t.roleID)]
);

export const Role = pgTable(
  "Role",
  {
    id: serial("id").primaryKey(),
    name: text("name"),
    displayOrder: integer("displayOrder"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("Role_displayOrder_idx").on(t.displayOrder)]
);

export const Policy = pgTable("Policy", {
  id: serial("id").primaryKey(),
  name: text("name"),
  resource: text("resource"),
  action: text("action"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});

export const RolePolicy = pgTable(
  "RolePolicy",
  {
    id: serial("id").primaryKey(),
    roleID: integer("roleID"),
    policyID: integer("policyID"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("RolePolicy_roleID_policyID_idx").on(t.roleID, t.policyID)]
);

export const Provider = pgTable("Provider", {
  id: serial("id").primaryKey(),
  name: text("name"),
  apiKey: text("apiKey"),
  endpoint: text("endpoint"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});

export const Model = pgTable(
  "Model",
  {
    id: serial("id").primaryKey(),
    providerID: integer("providerID"),
    name: text("name"),
    internalName: text("internalName"),
    type: text("type"),
    description: text("description"),
    maxContext: integer("maxContext"),
    maxOutput: integer("maxOutput"),
    maxReasoning: integer("maxReasoning"),
    cost1kInput: doublePrecision("cost1kInput"),
    cost1kOutput: doublePrecision("cost1kOutput"),
    cost1kCacheRead: doublePrecision("cost1kCacheRead"),
    cost1kCacheWrite: doublePrecision("cost1kCacheWrite"),
    defaultParameters: json("defaultParameters"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("Model_internalName_idx").on(t.internalName),
    index("Model_providerID_idx").on(t.providerID),
  ]
);

export const Usage = pgTable(
  "Usage",
  {
    id: serial("id").primaryKey(),
    userID: integer("userID"),
    modelID: integer("modelID"),
    type: text("type"),
    agentID: integer("agentID"),
    messageID: integer("messageID"),
    inputTokens: doublePrecision("inputTokens"),
    outputTokens: doublePrecision("outputTokens"),
    cacheReadTokens: doublePrecision("cacheReadTokens"),
    cacheWriteTokens: doublePrecision("cacheWriteTokens"),
    cost: doublePrecision("cost"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("Usage_userID_idx").on(t.userID),
    index("Usage_modelID_idx").on(t.modelID),
    index("Usage_createdAt_idx").on(t.createdAt),
    index("Usage_userID_createdAt_idx").on(t.userID, t.createdAt),
  ]
);

export const Prompt = pgTable(
  "Prompt",
  {
    id: serial("id").primaryKey(),
    name: text("name"),
    version: integer("version"),
    content: text("content"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("Prompt_name_idx").on(t.name),
    uniqueIndex("Prompt_name_version_idx").on(t.name, t.version),
  ]
);

export const Agent = pgTable(
  "Agent",
  {
    id: serial("id").primaryKey(),
    userID: integer("userID"),
    modelID: integer("modelID"),
    name: text("name"),
    description: text("description"),
    promptID: integer("promptID"),
    modelParameters: json("modelParameters"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("Agent_userID_idx").on(t.userID),
    index("Agent_modelID_idx").on(t.modelID),
    index("Agent_promptID_idx").on(t.promptID),
  ]
);

export const Tool = pgTable("Tool", {
  id: serial("id").primaryKey(),
  name: text("name"),
  description: text("description"),
  type: text("type"),
  authenticationType: text("authenticationType"),
  endpoint: text("endpoint"),
  transportType: text("transportType"),
  customConfig: json("customConfig"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});

export const Conversation = pgTable(
  "Conversation",
  {
    id: serial("id").primaryKey(),
    userID: integer("userID"),
    agentID: integer("agentID"),
    title: text("title"),
    deleted: boolean("deleted").default(false),
    deletedAt: timestamp("deletedAt", { withTimezone: true }),
    summaryMessageID: integer("summaryMessageID").default(0),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("Conversation_agentID_idx").on(t.agentID),
    index("Conversation_userID_createdAt_idx").on(t.userID, t.createdAt),
    index("Conversation_deleted_idx").on(t.deleted),
  ]
);

export const Message = pgTable(
  "Message",
  {
    id: serial("id").primaryKey(),
    conversationID: integer("conversationID"),
    parentID: integer("parentID"),
    role: text("role"),
    content: json("content"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("Message_conversationID_idx").on(t.conversationID),
    index("Message_conversationID_createdAt_idx").on(t.conversationID, t.createdAt),
  ]
);

export const Resource = pgTable(
  "Resource",
  {
    id: serial("id").primaryKey(),
    agentID: integer("agentID"),
    messageID: integer("messageID"),
    name: text("name"),
    type: text("type"),
    content: text("content"),
    s3Uri: text("s3Uri"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("Resource_agentID_idx").on(t.agentID),
    index("Resource_messageID_idx").on(t.messageID),
  ]
);

export const Vector = pgTable(
  "Vector",
  {
    id: serial("id").primaryKey(),
    conversationID: integer("conversationID"),
    resourceID: integer("resourceID"),
    toolID: integer("toolID"),
    order: integer("order"),
    content: text("content"),
    embedding: json("embedding"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("Vector_conversationID_idx").on(t.conversationID),
    index("Vector_toolID_idx").on(t.toolID),
    index("Vector_resourceID_order_idx").on(t.resourceID, t.order),
  ]
);

export const UserAgent = pgTable(
  "UserAgent",
  {
    id: serial("id").primaryKey(),
    userID: integer("userID"),
    agentID: integer("agentID"),
    role: text("role"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("UserAgent_userID_agentID_idx").on(t.userID, t.agentID)]
);

export const UserTool = pgTable(
  "UserTool",
  {
    id: serial("id").primaryKey(),
    userID: integer("userID"),
    toolID: integer("toolID"),
    credential: json("credential"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("UserTool_userID_toolID_idx").on(t.userID, t.toolID)]
);

export const AgentTool = pgTable(
  "AgentTool",
  {
    id: serial("id").primaryKey(),
    toolID: integer("toolID"),
    agentID: integer("agentID"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("AgentTool_toolID_agentID_idx").on(t.toolID, t.agentID)]
);

// ===== Relations =====

export const userRelations = relations(User, ({ one, many }) => ({
  Role: one(Role, { fields: [User.roleID], references: [Role.id] }),
  Agents: many(Agent),
  Conversations: many(Conversation),
  Usages: many(Usage),
  UserAgents: many(UserAgent),
  UserTools: many(UserTool),
}));

export const roleRelations = relations(Role, ({ many }) => ({
  Users: many(User),
  RolePolicies: many(RolePolicy),
}));

export const policyRelations = relations(Policy, ({ many }) => ({
  RolePolicies: many(RolePolicy),
}));

export const rolePolicyRelations = relations(RolePolicy, ({ one }) => ({
  Role: one(Role, { fields: [RolePolicy.roleID], references: [Role.id] }),
  Policy: one(Policy, { fields: [RolePolicy.policyID], references: [Policy.id] }),
}));

export const providerRelations = relations(Provider, ({ many }) => ({
  Models: many(Model),
}));

export const modelRelations = relations(Model, ({ one, many }) => ({
  Provider: one(Provider, { fields: [Model.providerID], references: [Provider.id] }),
  Usages: many(Usage),
}));

export const usageRelations = relations(Usage, ({ one }) => ({
  User: one(User, { fields: [Usage.userID], references: [User.id] }),
  Model: one(Model, { fields: [Usage.modelID], references: [Model.id] }),
  Agent: one(Agent, { fields: [Usage.agentID], references: [Agent.id] }),
  Message: one(Message, { fields: [Usage.messageID], references: [Message.id] }),
}));

export const promptRelations = relations(Prompt, ({ many }) => ({
  Agents: many(Agent),
}));

export const agentRelations = relations(Agent, ({ one, many }) => ({
  User: one(User, { fields: [Agent.userID], references: [User.id] }),
  Model: one(Model, { fields: [Agent.modelID], references: [Model.id] }),
  Prompt: one(Prompt, { fields: [Agent.promptID], references: [Prompt.id] }),
  Conversations: many(Conversation),
  Resources: many(Resource),
  UserAgents: many(UserAgent),
  AgentTools: many(AgentTool),
}));

export const toolRelations = relations(Tool, ({ many }) => ({
  Vectors: many(Vector),
  UserTools: many(UserTool),
  AgentTools: many(AgentTool),
}));

export const conversationRelations = relations(Conversation, ({ one, many }) => ({
  User: one(User, { fields: [Conversation.userID], references: [User.id] }),
  Agent: one(Agent, { fields: [Conversation.agentID], references: [Agent.id] }),
  Messages: many(Message),
  Vectors: many(Vector),
}));

export const messageRelations = relations(Message, ({ one, many }) => ({
  Conversation: one(Conversation, {
    fields: [Message.conversationID],
    references: [Conversation.id],
  }),
  Resources: many(Resource),
  Usages: many(Usage),
}));

export const resourceRelations = relations(Resource, ({ one, many }) => ({
  Agent: one(Agent, { fields: [Resource.agentID], references: [Agent.id] }),
  Message: one(Message, { fields: [Resource.messageID], references: [Message.id] }),
  Vectors: many(Vector),
}));

export const vectorRelations = relations(Vector, ({ one }) => ({
  Conversation: one(Conversation, {
    fields: [Vector.conversationID],
    references: [Conversation.id],
  }),
  Resource: one(Resource, { fields: [Vector.resourceID], references: [Resource.id] }),
  Tool: one(Tool, { fields: [Vector.toolID], references: [Tool.id] }),
}));

export const userAgentRelations = relations(UserAgent, ({ one }) => ({
  User: one(User, { fields: [UserAgent.userID], references: [User.id] }),
  Agent: one(Agent, { fields: [UserAgent.agentID], references: [Agent.id] }),
}));

export const userToolRelations = relations(UserTool, ({ one }) => ({
  User: one(User, { fields: [UserTool.userID], references: [User.id] }),
  Tool: one(Tool, { fields: [UserTool.toolID], references: [Tool.id] }),
}));

export const agentToolRelations = relations(AgentTool, ({ one }) => ({
  Agent: one(Agent, { fields: [AgentTool.agentID], references: [Agent.id] }),
  Tool: one(Tool, { fields: [AgentTool.toolID], references: [Tool.id] }),
}));

// ===== All tables (for iteration) =====

export const tables = {
  User,
  Role,
  Policy,
  RolePolicy,
  Provider,
  Model,
  Usage,
  Prompt,
  Agent,
  Tool,
  Conversation,
  Message,
  Resource,
  Vector,
  UserAgent,
  UserTool,
  AgentTool,
};

// ===== Seed database =====

/**
 * Seeds the database with initial data from CSV files.
 * Accepts `db` (drizzle instance) and optionally `t` (table references).
 * When `t` is omitted, uses this module's PG tables. For SQLite, pass the SQLite tables.
 */
export async function seedDatabase(db) {
  const { sql, eq } = await import("drizzle-orm");

  const T = { Role, Policy, RolePolicy, Provider, Model, Prompt, Agent, Tool, AgentTool, User };

  const roles = loadCsv(resolve(dataDir, "roles.csv"));
  const policies = loadCsv(resolve(dataDir, "policies.csv"));
  const rolePolicies = loadCsv(resolve(dataDir, "role-policies.csv"));
  const providers = loadCsv(resolve(dataDir, "providers.csv"));
  const modelRows = loadCsv(resolve(dataDir, "models.csv"));
  const prompts = loadCsv(resolve(dataDir, "prompts.csv"));
  const agents = loadCsv(resolve(dataDir, "agents.csv"));
  const tools = loadCsv(resolve(dataDir, "tools.csv"));
  const agentTools = loadCsv(resolve(dataDir, "agent-tools.csv"));

  // Helper: upsert rows by inserting and updating on conflict (id column)
  async function upsert(table, rows, conflictTarget, updateCols) {
    if (!rows.length) return;
    const setObj = {};
    for (const col of updateCols) {
      setObj[col] = sql.raw(`excluded."${col}"`);
    }
    await db.insert(table).values(rows).onConflictDoUpdate({
      target: conflictTarget,
      set: setObj,
    });
  }

  await upsert(T.Role, roles, T.Role.id, ["name", "displayOrder"]);
  await upsert(T.Policy, policies, T.Policy.id, ["name", "resource", "action"]);
  await upsert(
    T.RolePolicy,
    rolePolicies,
    [T.RolePolicy.roleID, T.RolePolicy.policyID],
    ["roleID", "policyID"]
  );
  await upsert(T.Provider, providers, T.Provider.id, ["name"]);
  await upsert(T.Model, modelRows, T.Model.id, [
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
  ]);
  await upsert(T.Prompt, prompts, T.Prompt.id, ["name", "version", "content"]);
  await upsert(T.Agent, agents, T.Agent.id, ["name", "promptID"]);
  await upsert(T.Tool, tools, T.Tool.id, ["name", "description", "type"]);
  await upsert(
    T.AgentTool,
    agentTools,
    [T.AgentTool.toolID, T.AgentTool.agentID],
    ["agentID", "toolID"]
  );

  // Reset serial sequences to max(id) so auto-increment works after explicit-ID inserts
  for (const [name, table] of Object.entries(T)) {
    if (table.id) {
      await db.execute(
        sql`SELECT setval(pg_get_serial_sequence('"${sql.raw(name)}"', 'id'), COALESCE((SELECT MAX("id") FROM "${sql.raw(name)}"), 0) + 1, false)`
      );
    }
  }

  // Create test admin user if TEST_API_KEY is set
  if (process.env.TEST_API_KEY) {
    const existing = await db
      .select()
      .from(T.User)
      .where(eq(T.User.email, "test@test.com"))
      .limit(1);
    if (!existing.length) {
      await db.insert(T.User).values({
        email: "test@test.com",
        firstName: "Test",
        lastName: "Admin",
        status: "active",
        roleID: 1,
        apiKey: process.env.TEST_API_KEY,
        budget: 1000,
        remaining: 1000,
      });
    }
  }
}
