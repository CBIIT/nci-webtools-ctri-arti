ALTER TABLE "Usage" ADD COLUMN IF NOT EXISTS "requestId" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Usage_requestId_idx" ON "Usage" ("requestId");
