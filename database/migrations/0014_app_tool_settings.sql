CREATE TABLE IF NOT EXISTS "AppToolSetting" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "AppToolSetting_name_idx" ON "AppToolSetting" ("name");
