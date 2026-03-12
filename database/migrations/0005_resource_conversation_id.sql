ALTER TABLE "Resource" ADD COLUMN "conversationID" integer;--> statement-breakpoint
CREATE INDEX "Resource_conversationID_idx" ON "Resource" USING btree ("conversationID");