CREATE INDEX IF NOT EXISTS "Vector_content_trgm_idx" ON "Vector" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Vector_content_tsv_idx" ON "Vector" USING gin (to_tsvector('english', coalesce("content", '')));
