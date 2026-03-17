CREATE TABLE IF NOT EXISTS "Guardrail" (
  "id" serial PRIMARY KEY,
  "name" text,
  "description" text,
  "blockedInputMessaging" text,
  "blockedOutputsMessaging" text,
  "policyConfig" json,
  "awsGuardrailId" text,
  "awsGuardrailArn" text,
  "awsGuardrailVersion" text,
  "specHash" text,
  "lastSyncError" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "guardrailID" integer;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Agent_guardrailID_Guardrail_id_fk'
  ) THEN
    ALTER TABLE "Agent"
    ADD CONSTRAINT "Agent_guardrailID_Guardrail_id_fk"
    FOREIGN KEY ("guardrailID") REFERENCES "Guardrail"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Guardrail_name_idx" ON "Guardrail" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Guardrail_awsGuardrailId_idx" ON "Guardrail" ("awsGuardrailId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Agent_guardrailID_idx" ON "Agent" ("guardrailID");
