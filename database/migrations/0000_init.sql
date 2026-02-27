-- Initial schema migration (idempotent — safe on fresh and existing databases)

CREATE TABLE IF NOT EXISTS "Agent" (
	"id" serial PRIMARY KEY NOT NULL,
	"userID" integer,
	"modelID" integer,
	"name" text,
	"description" text,
	"promptID" integer,
	"modelParameters" json,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AgentTool" (
	"id" serial PRIMARY KEY NOT NULL,
	"toolID" integer,
	"agentID" integer,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Conversation" (
	"id" serial PRIMARY KEY NOT NULL,
	"userID" integer,
	"agentID" integer,
	"title" text,
	"deleted" boolean DEFAULT false,
	"deletedAt" timestamp with time zone,
	"summaryMessageID" integer DEFAULT 0,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Message" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationID" integer,
	"parentID" integer,
	"role" text,
	"content" json,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Model" (
	"id" serial PRIMARY KEY NOT NULL,
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
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Policy" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"resource" text,
	"action" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Prompt" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"version" integer,
	"content" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Provider" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"apiKey" text,
	"endpoint" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Resource" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentID" integer,
	"messageID" integer,
	"name" text,
	"type" text,
	"content" text,
	"s3Uri" text,
	"metadata" json,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Role" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"displayOrder" integer,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RolePolicy" (
	"id" serial PRIMARY KEY NOT NULL,
	"roleID" integer,
	"policyID" integer,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Tool" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"description" text,
	"type" text,
	"authenticationType" text,
	"endpoint" text,
	"transportType" text,
	"customConfig" json,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Usage" (
	"id" serial PRIMARY KEY NOT NULL,
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
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text,
	"firstName" text,
	"lastName" text,
	"status" text,
	"roleID" integer,
	"apiKey" text,
	"budget" double precision,
	"remaining" double precision,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserAgent" (
	"id" serial PRIMARY KEY NOT NULL,
	"userID" integer,
	"agentID" integer,
	"role" text,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserTool" (
	"id" serial PRIMARY KEY NOT NULL,
	"userID" integer,
	"toolID" integer,
	"credential" json,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Vector" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationID" integer,
	"resourceID" integer,
	"toolID" integer,
	"order" integer,
	"content" text,
	"embedding" json,
	"createdAt" timestamp with time zone DEFAULT now(),
	"updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"sid" varchar NOT NULL COLLATE "default",
	"sess" json NOT NULL,
	"expire" timestamp(6) NOT NULL,
	CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Agent_userID_idx" ON "Agent" USING btree ("userID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Agent_modelID_idx" ON "Agent" USING btree ("modelID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Agent_promptID_idx" ON "Agent" USING btree ("promptID");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "AgentTool_toolID_agentID_idx" ON "AgentTool" USING btree ("toolID","agentID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Conversation_agentID_idx" ON "Conversation" USING btree ("agentID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Conversation_userID_createdAt_idx" ON "Conversation" USING btree ("userID","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Conversation_deleted_idx" ON "Conversation" USING btree ("deleted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Message_conversationID_idx" ON "Message" USING btree ("conversationID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Message_conversationID_createdAt_idx" ON "Message" USING btree ("conversationID","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Model_internalName_idx" ON "Model" USING btree ("internalName");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Model_providerID_idx" ON "Model" USING btree ("providerID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Prompt_name_idx" ON "Prompt" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Prompt_name_version_idx" ON "Prompt" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Resource_agentID_idx" ON "Resource" USING btree ("agentID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Resource_messageID_idx" ON "Resource" USING btree ("messageID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Role_displayOrder_idx" ON "Role" USING btree ("displayOrder");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "RolePolicy_roleID_policyID_idx" ON "RolePolicy" USING btree ("roleID","policyID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Usage_userID_idx" ON "Usage" USING btree ("userID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Usage_modelID_idx" ON "Usage" USING btree ("modelID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Usage_createdAt_idx" ON "Usage" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Usage_userID_createdAt_idx" ON "Usage" USING btree ("userID","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "User_roleID_idx" ON "User" USING btree ("roleID");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserAgent_userID_agentID_idx" ON "UserAgent" USING btree ("userID","agentID");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UserTool_userID_toolID_idx" ON "UserTool" USING btree ("userID","toolID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Vector_conversationID_idx" ON "Vector" USING btree ("conversationID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Vector_toolID_idx" ON "Vector" USING btree ("toolID");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Vector_resourceID_order_idx" ON "Vector" USING btree ("resourceID","order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" USING btree ("expire");
--> statement-breakpoint
-- Fix Sequelize tables: Sequelize manages timestamps in JS, not via DB defaults.
-- Existing tables may have NOT NULL without DEFAULT, causing seed inserts to fail.
ALTER TABLE "Role" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Provider" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Model" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Prompt" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Agent" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Resource" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Vector" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Usage" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Policy" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "RolePolicy" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Tool" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AgentTool" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "UserAgent" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "UserTool" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();
