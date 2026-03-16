CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Vector' AND column_name = 'embedding' AND udt_name != 'vector'
  ) THEN
    ALTER TABLE "Vector" DROP COLUMN "embedding";
    ALTER TABLE "Vector" ADD COLUMN "embedding" vector(3072);
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Vector' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE "Vector" ADD COLUMN "embedding" vector(3072);
  END IF;
END $$;