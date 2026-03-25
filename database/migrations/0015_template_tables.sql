CREATE TABLE IF NOT EXISTS "Template" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "version" text,
  "sourceFile" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Template_name_idx" ON "Template" ("name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TemplateSection" (
  "id" serial PRIMARY KEY NOT NULL,
  "templateID" integer NOT NULL REFERENCES "Template"("id") ON DELETE CASCADE,
  "sectionNumber" integer NOT NULL,
  "level" integer NOT NULL DEFAULT 0,
  "title" text NOT NULL,
  "content" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "TemplateSection_templateID_idx" ON "TemplateSection" ("templateID");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "TemplateSection_templateID_sectionNumber_idx" ON "TemplateSection" ("templateID", "sectionNumber");
