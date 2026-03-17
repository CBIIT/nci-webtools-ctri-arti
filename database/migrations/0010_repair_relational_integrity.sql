UPDATE "User"
SET "roleID" = null
WHERE "roleID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Role" WHERE "Role"."id" = "User"."roleID");
--> statement-breakpoint
DELETE FROM "RolePolicy"
WHERE "roleID" IS NULL
   OR "policyID" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "Role" WHERE "Role"."id" = "RolePolicy"."roleID")
   OR NOT EXISTS (SELECT 1 FROM "Policy" WHERE "Policy"."id" = "RolePolicy"."policyID");
--> statement-breakpoint
UPDATE "Model"
SET "providerID" = null
WHERE "providerID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Provider" WHERE "Provider"."id" = "Model"."providerID");
--> statement-breakpoint
DELETE FROM "Agent"
WHERE "userID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "Agent"."userID");
--> statement-breakpoint
UPDATE "Agent"
SET "modelID" = null
WHERE "modelID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Model" WHERE "Model"."id" = "Agent"."modelID");
--> statement-breakpoint
UPDATE "Agent"
SET "promptID" = null
WHERE "promptID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Prompt" WHERE "Prompt"."id" = "Agent"."promptID");
--> statement-breakpoint
DELETE FROM "Conversation"
WHERE "userID" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "Conversation"."userID");
--> statement-breakpoint
UPDATE "Conversation"
SET "agentID" = null
WHERE "agentID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Agent" WHERE "Agent"."id" = "Conversation"."agentID");
--> statement-breakpoint
DELETE FROM "Message"
WHERE "conversationID" IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM "Conversation" WHERE "Conversation"."id" = "Message"."conversationID"
   );
--> statement-breakpoint
UPDATE "Message" AS child
SET "parentID" = null
WHERE "parentID" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Message" AS parent
    WHERE parent."id" = child."parentID"
      AND parent."conversationID" = child."conversationID"
  );
--> statement-breakpoint
UPDATE "Conversation" AS c
SET "summaryMessageID" = null
WHERE "summaryMessageID" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Message" AS m
    WHERE m."id" = c."summaryMessageID"
      AND m."conversationID" = c."id"
  );
--> statement-breakpoint
UPDATE "Resource" AS r
SET
  "conversationID" = m."conversationID",
  "userID" = c."userID",
  "agentID" = COALESCE(r."agentID", c."agentID")
FROM "Message" AS m
JOIN "Conversation" AS c ON c."id" = m."conversationID"
WHERE r."messageID" = m."id"
  AND (
    r."conversationID" IS DISTINCT FROM m."conversationID"
    OR r."userID" IS DISTINCT FROM c."userID"
    OR (r."agentID" IS NULL AND c."agentID" IS NOT NULL)
  );
--> statement-breakpoint
UPDATE "Resource"
SET "messageID" = null
WHERE "messageID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Message" WHERE "Message"."id" = "Resource"."messageID");
--> statement-breakpoint
UPDATE "Resource"
SET "conversationID" = null
WHERE "conversationID" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Conversation" WHERE "Conversation"."id" = "Resource"."conversationID"
  );
--> statement-breakpoint
DELETE FROM "Resource"
WHERE "userID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "Resource"."userID");
--> statement-breakpoint
UPDATE "Resource"
SET "agentID" = null
WHERE "agentID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Agent" WHERE "Agent"."id" = "Resource"."agentID");
--> statement-breakpoint
UPDATE "Vector" AS v
SET "conversationID" = r."conversationID"
FROM "Resource" AS r
WHERE v."resourceID" = r."id"
  AND v."conversationID" IS DISTINCT FROM r."conversationID";
--> statement-breakpoint
UPDATE "Vector"
SET "resourceID" = null
WHERE "resourceID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Resource" WHERE "Resource"."id" = "Vector"."resourceID");
--> statement-breakpoint
UPDATE "Vector"
SET "conversationID" = null
WHERE "conversationID" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Conversation" WHERE "Conversation"."id" = "Vector"."conversationID"
  );
--> statement-breakpoint
UPDATE "Vector"
SET "toolID" = null
WHERE "toolID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Tool" WHERE "Tool"."id" = "Vector"."toolID");
--> statement-breakpoint
DELETE FROM "Vector"
WHERE "resourceID" IS NULL
  AND "conversationID" IS NULL
  AND "toolID" IS NULL;
--> statement-breakpoint
DELETE FROM "Usage"
WHERE "userID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "Usage"."userID");
--> statement-breakpoint
UPDATE "Usage"
SET "modelID" = null
WHERE "modelID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Model" WHERE "Model"."id" = "Usage"."modelID");
--> statement-breakpoint
UPDATE "Usage"
SET "agentID" = null
WHERE "agentID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Agent" WHERE "Agent"."id" = "Usage"."agentID");
--> statement-breakpoint
UPDATE "Usage"
SET "messageID" = null
WHERE "messageID" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Message" WHERE "Message"."id" = "Usage"."messageID");
--> statement-breakpoint
DELETE FROM "UserAgent"
WHERE "userID" IS NULL
   OR "agentID" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "UserAgent"."userID")
   OR NOT EXISTS (SELECT 1 FROM "Agent" WHERE "Agent"."id" = "UserAgent"."agentID");
--> statement-breakpoint
DELETE FROM "UserTool"
WHERE "userID" IS NULL
   OR "toolID" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "UserTool"."userID")
   OR NOT EXISTS (SELECT 1 FROM "Tool" WHERE "Tool"."id" = "UserTool"."toolID");
--> statement-breakpoint
DELETE FROM "AgentTool"
WHERE "agentID" IS NULL
   OR "toolID" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "Agent" WHERE "Agent"."id" = "AgentTool"."agentID")
   OR NOT EXISTS (SELECT 1 FROM "Tool" WHERE "Tool"."id" = "AgentTool"."toolID");
