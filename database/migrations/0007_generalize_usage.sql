ALTER TABLE "Usage" ADD COLUMN IF NOT EXISTS "quantity" double precision;--> statement-breakpoint
ALTER TABLE "Usage" ADD COLUMN IF NOT EXISTS "unit" text;--> statement-breakpoint
ALTER TABLE "Usage" ADD COLUMN IF NOT EXISTS "unitCost" double precision;--> statement-breakpoint
ALTER TABLE "Model" ADD COLUMN IF NOT EXISTS "pricing" json;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Usage' AND column_name = 'inputTokens'
  ) THEN
    UPDATE "Usage" SET "quantity" = "inputTokens", "unit" = 'input_tokens', "unitCost" = 0 WHERE "unit" IS NULL AND "inputTokens" IS NOT NULL;
    INSERT INTO "Usage" ("userID", "modelID", "type", "agentID", "messageID", "quantity", "unit", "unitCost", "cost", "createdAt", "updatedAt") SELECT "userID", "modelID", "type", "agentID", "messageID", "outputTokens", 'output_tokens', 0, 0, "createdAt", "updatedAt" FROM "Usage" WHERE "outputTokens" > 0 AND "unit" = 'input_tokens';
    INSERT INTO "Usage" ("userID", "modelID", "type", "agentID", "messageID", "quantity", "unit", "unitCost", "cost", "createdAt", "updatedAt") SELECT "userID", "modelID", "type", "agentID", "messageID", "cacheReadTokens", 'cache_read_tokens', 0, 0, "createdAt", "updatedAt" FROM "Usage" WHERE "cacheReadTokens" > 0 AND "unit" = 'input_tokens';
    INSERT INTO "Usage" ("userID", "modelID", "type", "agentID", "messageID", "quantity", "unit", "unitCost", "cost", "createdAt", "updatedAt") SELECT "userID", "modelID", "type", "agentID", "messageID", "cacheWriteTokens", 'cache_write_tokens', 0, 0, "createdAt", "updatedAt" FROM "Usage" WHERE "cacheWriteTokens" > 0 AND "unit" = 'input_tokens';
    ALTER TABLE "Usage" DROP COLUMN "inputTokens";
    ALTER TABLE "Usage" DROP COLUMN "outputTokens";
    ALTER TABLE "Usage" DROP COLUMN "cacheReadTokens";
    ALTER TABLE "Usage" DROP COLUMN "cacheWriteTokens";
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Usage_unit_idx" ON "Usage" ("unit");--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Model' AND column_name = 'cost1kInput'
  ) THEN
    UPDATE "Model" SET "pricing" = json_build_object('input_tokens', COALESCE("cost1kInput" / 1000.0, 0), 'output_tokens', COALESCE("cost1kOutput" / 1000.0, 0), 'cache_read_tokens', COALESCE("cost1kCacheRead" / 1000.0, 0), 'cache_write_tokens', COALESCE("cost1kCacheWrite" / 1000.0, 0)) WHERE "pricing" IS NULL AND "cost1kInput" IS NOT NULL;
  END IF;
END $$;