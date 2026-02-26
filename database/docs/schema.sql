-- Generated from uml2.txt
-- PostgreSQL DDL

-- ============================================================
-- User & Access Management
-- ============================================================

CREATE TABLE "Roles" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),           -- values: 'Admin', 'Super User', 'User'
    "displayOrder" INTEGER,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Policy" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    resource VARCHAR(255),
    action VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "RolePolicy" (
    "roleID" INTEGER NOT NULL REFERENCES "Roles"(id),
    "policyID" INTEGER NOT NULL REFERENCES "Policy"(id),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("roleID", "policyID")
);

CREATE TABLE "User" (
    id SERIAL PRIMARY KEY,
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    email VARCHAR(255),
    "roleId" INTEGER REFERENCES "Roles"(id),
    status VARCHAR(255),         -- values: 'Active', 'Inactive', 'Disabled'
    "apiKey" VARCHAR(255),
    budget FLOAT,
    remaining FLOAT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AI Providers & Models
-- ============================================================

CREATE TABLE "Providers" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    "apiKey" VARCHAR(255),
    endpoint VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Model" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    type VARCHAR(255),           -- values: 'chat', 'embedding', 'reranking'
    description VARCHAR(255),
    "providerId" INTEGER REFERENCES "Providers"(id),
    "internalName" VARCHAR(255),
    "summarizeThreshold" INTEGER,
    "defaultParameters" JSONB,
    "maxContext" INTEGER,
    "maxOutput" INTEGER,
    "maxReasoning" INTEGER,
    "cost1kInput" FLOAT,
    "cost1KOutput" FLOAT,
    "cost1kCacheReason" FLOAT,
    "cost1kCacheWrite" FLOAT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Agent & Prompt Configuration
-- ============================================================

CREATE TABLE "Prompt" (
    id SERIAL PRIMARY KEY,
    "agentID" INTEGER,           -- FK added after Agent is created
    version INTEGER,
    content TEXT,
    name VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Agent" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    description VARCHAR(255),
    "promptId" INTEGER REFERENCES "Prompt"(id),
    "modelID" INTEGER REFERENCES "Model"(id),
    "modelParameters" JSONB,     -- structure: { temperature, maxToken, topP, topK, ... }
    "creatorID" INTEGER REFERENCES "User"(id),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE "Prompt" ADD CONSTRAINT fk_prompt_agent
    FOREIGN KEY ("agentID") REFERENCES "Agent"(id);

-- ============================================================
-- Core Conversation Data
-- ============================================================

CREATE TABLE "Conversation" (
    id SERIAL PRIMARY KEY,
    "agentID" INTEGER REFERENCES "Agent"(id),
    "userID" INTEGER REFERENCES "User"(id),
    deleted BOOLEAN DEFAULT FALSE,
    "deletedAt" TIMESTAMP WITH TIME ZONE,
    title VARCHAR(255),
    "latestSummarySN" INTEGER,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Message" (
    id SERIAL PRIMARY KEY,
    "conversationID" INTEGER REFERENCES "Conversation"(id),
    "serialNumber" INTEGER,
    role VARCHAR(255),           -- values: 'system', 'user', 'assistant', 'tool'
    content JSONB,
    tokens INTEGER,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Tools & Resources
-- ============================================================

CREATE TABLE "Tool" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    description VARCHAR(255),
    type VARCHAR(255),           -- values: 'MCP', 'custom'
    "authenticationType" VARCHAR(255),
    endpoint VARCHAR(255),
    "transportType" VARCHAR(255),
    "customConfig" JSONB,        -- structure: { McpType, embeddingModelID, rerankingModelID, chunkSize, overlap, retrieveTopN, rerankTopN, ... }
                                 -- McpType values: 'knowledgebase', 'API', 'database'
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Resource" (
    id SERIAL PRIMARY KEY,
    "toolID" INTEGER REFERENCES "Tool"(id),
    "conversationID" INTEGER REFERENCES "Conversation"(id),
    "messageID" INTEGER REFERENCES "Message"(id),
    name VARCHAR(255),
    description VARCHAR(255),
    metadata JSONB,
    "s3Uri" VARCHAR(255),
    "MIMEType" VARCHAR(255),
    content TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Vector" (
    id SERIAL PRIMARY KEY,
    "toolID" INTEGER REFERENCES "Tool"(id),
    "resourceID" INTEGER REFERENCES "Resource"(id),
    "order" INTEGER,
    embedding JSONB,
    content TEXT,
    "conversationID" INTEGER REFERENCES "Conversation"(id),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Relational / Join Tables
-- ============================================================

CREATE TABLE "UserAgent" (
    "userID" INTEGER NOT NULL REFERENCES "User"(id),
    "agentID" INTEGER NOT NULL REFERENCES "Agent"(id),
    role VARCHAR(255),           -- values: 'admin', 'user'
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("userID", "agentID")
);

CREATE TABLE "UserTool" (
    "userID" INTEGER NOT NULL REFERENCES "User"(id),
    "toolID" INTEGER NOT NULL REFERENCES "Tool"(id),
    credential JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("userID", "toolID")
);

CREATE TABLE "AgentTool" (
    "toolID" INTEGER NOT NULL REFERENCES "Tool"(id),
    "agentID" INTEGER NOT NULL REFERENCES "Agent"(id),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("toolID", "agentID")
);

-- ============================================================
-- System & Metrics
-- ============================================================

CREATE TABLE "Usages" (
    id SERIAL PRIMARY KEY,
    type VARCHAR(255),           -- values: 'user', 'agent', 'guardrail'
    "userID" INTEGER REFERENCES "User"(id),
    "agentID" INTEGER REFERENCES "Agent"(id),
    "messageID" INTEGER REFERENCES "Message"(id),
    "modelId" INTEGER REFERENCES "Model"(id),
    "inputTokens" FLOAT,
    outputtokens FLOAT,
    "cacheReadToken" FLOAT,
    "cacheWriteToken" FLOAT,
    cost FLOAT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE "Sessions" (
    sid VARCHAR(255) PRIMARY KEY,
    expires TIMESTAMP WITH TIME ZONE,
    data TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
