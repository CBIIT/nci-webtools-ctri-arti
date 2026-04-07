CREATE TABLE IF NOT EXISTS "Configuration" (
  "id" serial PRIMARY KEY,
  "key" text NOT NULL,
  "value" text NOT NULL DEFAULT '',
  "description" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Configuration_key_idx"
  ON "Configuration" ("key");
--> statement-breakpoint
INSERT INTO "Configuration" ("key", "value", "description")
VALUES ('DISABLED_TOOLS', '', 'Comma-separated list of disabled tool paths')
ON CONFLICT ("key") DO NOTHING;
