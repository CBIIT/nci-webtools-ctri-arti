ALTER TABLE "Resource" ADD COLUMN IF NOT EXISTS "userID" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Resource_userID_idx" ON "Resource" USING btree ("userID");