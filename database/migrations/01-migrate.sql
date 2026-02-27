-- Migration: Copy data from old schema (plural tables, lowercase FKs)
--            to new schema (singular tables, uppercase FKs, Conversation)
--
-- Run AFTER deploying new code (sync + seed creates the new empty tables).
-- Old tables are left intact.
-- Idempotent — ON CONFLICT DO NOTHING skips existing rows.
--
-- Usage: psql -f database/migrate.sql

BEGIN;

-- ===== Copy seed-like tables (may overlap with seed data) =====

INSERT INTO "Role" ("id", "name", "displayOrder", "createdAt", "updatedAt")
SELECT "id", "name", "order", "createdAt", "updatedAt"
FROM "Roles"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Provider" ("id", "name", "apiKey", "endpoint", "createdAt", "updatedAt")
SELECT "id", "name", "apiKey", "endpoint", "createdAt", "updatedAt"
FROM "Providers"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Model" ("id", "providerID", "name", "internalName", "type",
  "maxContext", "maxOutput", "maxReasoning",
  "cost1kInput", "cost1kOutput", "cost1kCacheRead", "cost1kCacheWrite",
  "createdAt", "updatedAt")
SELECT "id", "providerId", "name", "internalName", 'chat',
  "maxContext", "maxOutput", "maxReasoning",
  "cost1kInput", "cost1kOutput", "cost1kCacheRead", "cost1kCacheWrite",
  "createdAt", "updatedAt"
FROM "Models"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Prompt" ("id", "name", "version", "content", "createdAt", "updatedAt")
SELECT "id", "name", "version", "content", "createdAt", "updatedAt"
FROM "Prompts"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Agent" ("id", "userID", "modelID", "name", "promptID", "createdAt", "updatedAt")
SELECT "id", "userId", "modelId", "name", "promptId", "createdAt", "updatedAt"
FROM "Agents"
ON CONFLICT ("id") DO NOTHING;

-- ===== Copy user data =====

INSERT INTO "User" ("id", "email", "firstName", "lastName", "status",
  "roleID", "apiKey", "budget", "remaining", "createdAt", "updatedAt")
SELECT "id", "email", "firstName", "lastName", "status",
  "roleId", "apiKey", "limit", "remaining", "createdAt", "updatedAt"
FROM "Users"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Conversation" ("id", "userID", "agentID", "title",
  "deleted", "latestSummarySN", "createdAt", "updatedAt")
SELECT "id", "userId", "agentId", "name",
  false, 0, "createdAt", "updatedAt"
FROM "Threads"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Message" ("id", "conversationID", "role", "content", "createdAt", "updatedAt")
SELECT "id", "threadId", "role", "content", "createdAt", "updatedAt"
FROM "Messages"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Resource" ("id", "conversationID", "messageID",
  "name", "type", "content", "s3Uri", "metadata", "createdAt", "updatedAt")
SELECT "id", "threadId", "messageId",
  "name", "type", "content", "s3Uri", "metadata", "createdAt", "updatedAt"
FROM "Resources"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Vector" ("id", "conversationID", "resourceID",
  "order", "content", "embedding", "createdAt", "updatedAt")
SELECT "id", "threadId", "resourceId",
  "order", "text", "embedding", "createdAt", "updatedAt"
FROM "Vectors"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Usage" ("id", "userID", "modelID",
  "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
  "cost", "createdAt", "updatedAt")
SELECT "id", "userId", "modelId",
  "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
  "cost", "createdAt", "updatedAt"
FROM "Usages"
ON CONFLICT ("id") DO NOTHING;

-- ===== Migrate Agent.tools JSON → AgentTool join rows =====

INSERT INTO "AgentTool" ("agentID", "toolID", "createdAt", "updatedAt")
SELECT a."id", t."id", NOW(), NOW()
FROM "Agents" a,
     jsonb_array_elements_text(a."tools"::jsonb) AS tool_name
JOIN "Tool" t ON t."name" = tool_name
WHERE a."tools" IS NOT NULL
ON CONFLICT ("toolID", "agentID") DO NOTHING;

-- ===== Reset sequences so new inserts get correct IDs =====

SELECT setval(pg_get_serial_sequence('"User"',         'id'), COALESCE((SELECT MAX("id") FROM "User"),         1));
SELECT setval(pg_get_serial_sequence('"Role"',         'id'), COALESCE((SELECT MAX("id") FROM "Role"),         1));
SELECT setval(pg_get_serial_sequence('"Provider"',     'id'), COALESCE((SELECT MAX("id") FROM "Provider"),     1));
SELECT setval(pg_get_serial_sequence('"Model"',        'id'), COALESCE((SELECT MAX("id") FROM "Model"),        1));
SELECT setval(pg_get_serial_sequence('"Prompt"',       'id'), COALESCE((SELECT MAX("id") FROM "Prompt"),       1));
SELECT setval(pg_get_serial_sequence('"Agent"',        'id'), COALESCE((SELECT MAX("id") FROM "Agent"),        1));
SELECT setval(pg_get_serial_sequence('"Conversation"', 'id'), COALESCE((SELECT MAX("id") FROM "Conversation"), 1));
SELECT setval(pg_get_serial_sequence('"Message"',      'id'), COALESCE((SELECT MAX("id") FROM "Message"),      1));
SELECT setval(pg_get_serial_sequence('"Resource"',     'id'), COALESCE((SELECT MAX("id") FROM "Resource"),     1));
SELECT setval(pg_get_serial_sequence('"Vector"',       'id'), COALESCE((SELECT MAX("id") FROM "Vector"),       1));
SELECT setval(pg_get_serial_sequence('"Usage"',        'id'), COALESCE((SELECT MAX("id") FROM "Usage"),        1));

COMMIT;
