CREATE TABLE IF NOT EXISTS "Template" (
  "id" serial PRIMARY KEY,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "canonicalID" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Template_canonicalID_version_idx"
  ON "Template" ("canonicalID", "version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TemplateSection" (
  "id" serial PRIMARY KEY,
  "templateID" integer NOT NULL REFERENCES "Template" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "guidanceText" text NOT NULL,
  "required" boolean NOT NULL DEFAULT true
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TemplateSection_templateID_idx"
  ON "TemplateSection" ("templateID");
