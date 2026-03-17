DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_roleID_fkey') THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_roleID_fkey"
      FOREIGN KEY ("roleID") REFERENCES "Role"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolePolicy_roleID_fkey') THEN
    ALTER TABLE "RolePolicy"
      ADD CONSTRAINT "RolePolicy_roleID_fkey"
      FOREIGN KEY ("roleID") REFERENCES "Role"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RolePolicy_policyID_fkey') THEN
    ALTER TABLE "RolePolicy"
      ADD CONSTRAINT "RolePolicy_policyID_fkey"
      FOREIGN KEY ("policyID") REFERENCES "Policy"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Model_providerID_fkey') THEN
    ALTER TABLE "Model"
      ADD CONSTRAINT "Model_providerID_fkey"
      FOREIGN KEY ("providerID") REFERENCES "Provider"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Usage_userID_fkey') THEN
    ALTER TABLE "Usage"
      ADD CONSTRAINT "Usage_userID_fkey"
      FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Usage_modelID_fkey') THEN
    ALTER TABLE "Usage"
      ADD CONSTRAINT "Usage_modelID_fkey"
      FOREIGN KEY ("modelID") REFERENCES "Model"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Usage_agentID_fkey') THEN
    ALTER TABLE "Usage"
      ADD CONSTRAINT "Usage_agentID_fkey"
      FOREIGN KEY ("agentID") REFERENCES "Agent"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Usage_messageID_fkey') THEN
    ALTER TABLE "Usage"
      ADD CONSTRAINT "Usage_messageID_fkey"
      FOREIGN KEY ("messageID") REFERENCES "Message"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agent_userID_fkey') THEN
    ALTER TABLE "Agent"
      ADD CONSTRAINT "Agent_userID_fkey"
      FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agent_modelID_fkey') THEN
    ALTER TABLE "Agent"
      ADD CONSTRAINT "Agent_modelID_fkey"
      FOREIGN KEY ("modelID") REFERENCES "Model"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Agent_promptID_fkey') THEN
    ALTER TABLE "Agent"
      ADD CONSTRAINT "Agent_promptID_fkey"
      FOREIGN KEY ("promptID") REFERENCES "Prompt"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_userID_fkey') THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_userID_fkey"
      FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_agentID_fkey') THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_agentID_fkey"
      FOREIGN KEY ("agentID") REFERENCES "Agent"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_summaryMessageID_fkey') THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_summaryMessageID_fkey"
      FOREIGN KEY ("summaryMessageID") REFERENCES "Message"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_conversationID_fkey') THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_conversationID_fkey"
      FOREIGN KEY ("conversationID") REFERENCES "Conversation"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_parentID_fkey') THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_parentID_fkey"
      FOREIGN KEY ("parentID") REFERENCES "Message"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Resource_userID_fkey') THEN
    ALTER TABLE "Resource"
      ADD CONSTRAINT "Resource_userID_fkey"
      FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Resource_agentID_fkey') THEN
    ALTER TABLE "Resource"
      ADD CONSTRAINT "Resource_agentID_fkey"
      FOREIGN KEY ("agentID") REFERENCES "Agent"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Resource_conversationID_fkey') THEN
    ALTER TABLE "Resource"
      ADD CONSTRAINT "Resource_conversationID_fkey"
      FOREIGN KEY ("conversationID") REFERENCES "Conversation"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Resource_messageID_fkey') THEN
    ALTER TABLE "Resource"
      ADD CONSTRAINT "Resource_messageID_fkey"
      FOREIGN KEY ("messageID") REFERENCES "Message"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vector_conversationID_fkey') THEN
    ALTER TABLE "Vector"
      ADD CONSTRAINT "Vector_conversationID_fkey"
      FOREIGN KEY ("conversationID") REFERENCES "Conversation"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vector_resourceID_fkey') THEN
    ALTER TABLE "Vector"
      ADD CONSTRAINT "Vector_resourceID_fkey"
      FOREIGN KEY ("resourceID") REFERENCES "Resource"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vector_toolID_fkey') THEN
    ALTER TABLE "Vector"
      ADD CONSTRAINT "Vector_toolID_fkey"
      FOREIGN KEY ("toolID") REFERENCES "Tool"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAgent_userID_fkey') THEN
    ALTER TABLE "UserAgent"
      ADD CONSTRAINT "UserAgent_userID_fkey"
      FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAgent_agentID_fkey') THEN
    ALTER TABLE "UserAgent"
      ADD CONSTRAINT "UserAgent_agentID_fkey"
      FOREIGN KEY ("agentID") REFERENCES "Agent"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserTool_userID_fkey') THEN
    ALTER TABLE "UserTool"
      ADD CONSTRAINT "UserTool_userID_fkey"
      FOREIGN KEY ("userID") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserTool_toolID_fkey') THEN
    ALTER TABLE "UserTool"
      ADD CONSTRAINT "UserTool_toolID_fkey"
      FOREIGN KEY ("toolID") REFERENCES "Tool"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentTool_toolID_fkey') THEN
    ALTER TABLE "AgentTool"
      ADD CONSTRAINT "AgentTool_toolID_fkey"
      FOREIGN KEY ("toolID") REFERENCES "Tool"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentTool_agentID_fkey') THEN
    ALTER TABLE "AgentTool"
      ADD CONSTRAINT "AgentTool_agentID_fkey"
      FOREIGN KEY ("agentID") REFERENCES "Agent"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Conversation' AND column_name = 'userID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "Conversation" ALTER COLUMN "userID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Message' AND column_name = 'conversationID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "Message" ALTER COLUMN "conversationID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RolePolicy' AND column_name = 'roleID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "RolePolicy" ALTER COLUMN "roleID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RolePolicy' AND column_name = 'policyID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "RolePolicy" ALTER COLUMN "policyID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserAgent' AND column_name = 'userID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "UserAgent" ALTER COLUMN "userID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserAgent' AND column_name = 'agentID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "UserAgent" ALTER COLUMN "agentID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserTool' AND column_name = 'userID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "UserTool" ALTER COLUMN "userID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'UserTool' AND column_name = 'toolID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "UserTool" ALTER COLUMN "toolID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentTool' AND column_name = 'toolID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "AgentTool" ALTER COLUMN "toolID" SET NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AgentTool' AND column_name = 'agentID' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "AgentTool" ALTER COLUMN "agentID" SET NOT NULL;
  END IF;
END $$;
