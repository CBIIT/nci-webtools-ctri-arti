ALTER TABLE "Resource" ADD COLUMN "userID" integer;--> statement-breakpoint
CREATE INDEX "Resource_userID_idx" ON "Resource" USING btree ("userID");