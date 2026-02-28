-- Fix missing column defaults for Sequelize-era tables.
-- Sequelize manages defaults in JS; Drizzle relies on database-level defaults.

ALTER TABLE "Conversation" ALTER COLUMN "deleted" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "summaryMessageID" SET DEFAULT 0;
