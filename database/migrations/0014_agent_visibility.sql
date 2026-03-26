ALTER TABLE "Agent"
ADD COLUMN IF NOT EXISTS "visible" boolean DEFAULT true;
--> statement-breakpoint
UPDATE "Agent"
SET "visible" = true
WHERE "visible" IS NULL;
