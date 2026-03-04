-- Fix missing DEFAULT now() on timestamp columns.
-- The 0000_init migration was recorded as applied but its ALTER TABLE statements
-- were rolled back (Sequelize-era tables had NOT NULL without DEFAULT).

ALTER TABLE "Role" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Provider" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Model" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Prompt" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Agent" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Conversation" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Message" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Resource" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Vector" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Usage" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Policy" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "RolePolicy" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Tool" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "AgentTool" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "UserAgent" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "UserTool" ALTER COLUMN "createdAt" SET DEFAULT now(), ALTER COLUMN "updatedAt" SET DEFAULT now();
