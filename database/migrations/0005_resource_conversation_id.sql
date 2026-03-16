ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "conversationID" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Resource_conversationID_idx" ON "Resource" USING btree ("conversationID");