/**
 * Auto-migration helper for PostgreSQL (both real PG and PGlite).
 * Uses CREATE TABLE IF NOT EXISTS with raw SQL for idempotent schema setup.
 *
 * @param {function} exec — Accepts a SQL string, returns a promise.
 *   For postgres-js: (s) => sql.unsafe(s)
 *   For PGlite:      (s) => client.exec(s)
 */
export async function pushSchema(exec) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "User" (
      "id" serial PRIMARY KEY,
      "email" text,
      "firstName" text,
      "lastName" text,
      "status" text,
      "roleID" integer,
      "apiKey" text,
      "budget" double precision,
      "remaining" double precision,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Role" (
      "id" serial PRIMARY KEY,
      "name" text,
      "displayOrder" integer,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Policy" (
      "id" serial PRIMARY KEY,
      "name" text,
      "resource" text,
      "action" text,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "RolePolicy" (
      "id" serial PRIMARY KEY,
      "roleID" integer,
      "policyID" integer,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Provider" (
      "id" serial PRIMARY KEY,
      "name" text,
      "apiKey" text,
      "endpoint" text,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Model" (
      "id" serial PRIMARY KEY,
      "providerID" integer,
      "name" text,
      "internalName" text,
      "type" text,
      "description" text,
      "maxContext" integer,
      "maxOutput" integer,
      "maxReasoning" integer,
      "cost1kInput" double precision,
      "cost1kOutput" double precision,
      "cost1kCacheRead" double precision,
      "cost1kCacheWrite" double precision,
      "defaultParameters" json,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Usage" (
      "id" serial PRIMARY KEY,
      "userID" integer,
      "modelID" integer,
      "type" text,
      "agentID" integer,
      "messageID" integer,
      "inputTokens" double precision,
      "outputTokens" double precision,
      "cacheReadTokens" double precision,
      "cacheWriteTokens" double precision,
      "cost" double precision,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Prompt" (
      "id" serial PRIMARY KEY,
      "name" text,
      "version" integer,
      "content" text,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Agent" (
      "id" serial PRIMARY KEY,
      "userID" integer,
      "modelID" integer,
      "name" text,
      "description" text,
      "promptID" integer,
      "modelParameters" json,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Tool" (
      "id" serial PRIMARY KEY,
      "name" text,
      "description" text,
      "type" text,
      "authenticationType" text,
      "endpoint" text,
      "transportType" text,
      "customConfig" json,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Conversation" (
      "id" serial PRIMARY KEY,
      "userID" integer,
      "agentID" integer,
      "title" text,
      "deleted" boolean DEFAULT false,
      "deletedAt" timestamptz,
      "summaryMessageID" integer DEFAULT 0,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Message" (
      "id" serial PRIMARY KEY,
      "conversationID" integer,
      "parentID" integer,
      "role" text,
      "content" json,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Resource" (
      "id" serial PRIMARY KEY,
      "agentID" integer,
      "messageID" integer,
      "name" text,
      "type" text,
      "content" text,
      "s3Uri" text,
      "metadata" json,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "Vector" (
      "id" serial PRIMARY KEY,
      "conversationID" integer,
      "resourceID" integer,
      "toolID" integer,
      "order" integer,
      "content" text,
      "embedding" json,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "UserAgent" (
      "id" serial PRIMARY KEY,
      "userID" integer,
      "agentID" integer,
      "role" text,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "UserTool" (
      "id" serial PRIMARY KEY,
      "userID" integer,
      "toolID" integer,
      "credential" json,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "AgentTool" (
      "id" serial PRIMARY KEY,
      "toolID" integer,
      "agentID" integer,
      "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    )`,
    // Indexes
    `CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User" ("email")`,
    `CREATE INDEX IF NOT EXISTS "User_roleID_idx" ON "User" ("roleID")`,
    `CREATE INDEX IF NOT EXISTS "Role_displayOrder_idx" ON "Role" ("displayOrder")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "RolePolicy_roleID_policyID_idx" ON "RolePolicy" ("roleID", "policyID")`,
    `CREATE INDEX IF NOT EXISTS "Model_internalName_idx" ON "Model" ("internalName")`,
    `CREATE INDEX IF NOT EXISTS "Model_providerID_idx" ON "Model" ("providerID")`,
    `CREATE INDEX IF NOT EXISTS "Usage_userID_idx" ON "Usage" ("userID")`,
    `CREATE INDEX IF NOT EXISTS "Usage_modelID_idx" ON "Usage" ("modelID")`,
    `CREATE INDEX IF NOT EXISTS "Usage_createdAt_idx" ON "Usage" ("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Usage_userID_createdAt_idx" ON "Usage" ("userID", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Prompt_name_idx" ON "Prompt" ("name")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Prompt_name_version_idx" ON "Prompt" ("name", "version")`,
    `CREATE INDEX IF NOT EXISTS "Agent_userID_idx" ON "Agent" ("userID")`,
    `CREATE INDEX IF NOT EXISTS "Agent_modelID_idx" ON "Agent" ("modelID")`,
    `CREATE INDEX IF NOT EXISTS "Agent_promptID_idx" ON "Agent" ("promptID")`,
    `CREATE INDEX IF NOT EXISTS "Conversation_agentID_idx" ON "Conversation" ("agentID")`,
    `CREATE INDEX IF NOT EXISTS "Conversation_userID_createdAt_idx" ON "Conversation" ("userID", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Conversation_deleted_idx" ON "Conversation" ("deleted")`,
    `CREATE INDEX IF NOT EXISTS "Message_conversationID_idx" ON "Message" ("conversationID")`,
    `CREATE INDEX IF NOT EXISTS "Message_conversationID_createdAt_idx" ON "Message" ("conversationID", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "Resource_agentID_idx" ON "Resource" ("agentID")`,
    `CREATE INDEX IF NOT EXISTS "Resource_messageID_idx" ON "Resource" ("messageID")`,
    `CREATE INDEX IF NOT EXISTS "Vector_conversationID_idx" ON "Vector" ("conversationID")`,
    `CREATE INDEX IF NOT EXISTS "Vector_toolID_idx" ON "Vector" ("toolID")`,
    `CREATE INDEX IF NOT EXISTS "Vector_resourceID_order_idx" ON "Vector" ("resourceID", "order")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserAgent_userID_agentID_idx" ON "UserAgent" ("userID", "agentID")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "UserTool_userID_toolID_idx" ON "UserTool" ("userID", "toolID")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AgentTool_toolID_agentID_idx" ON "AgentTool" ("toolID", "agentID")`,
    // Session table for connect-pg-simple
    `CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    )`,
    `CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`,
  ];

  for (const stmt of statements) {
    await exec(stmt);
  }
}
