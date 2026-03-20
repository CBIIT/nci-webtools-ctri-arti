import db, { Agent, AgentTool, Conversation, Tool } from "database";

import { and, desc, eq, inArray } from "drizzle-orm";

import {
  agentReadCondition,
  createForbiddenError,
  createNotFoundError,
  getMutationCount,
  stripAutoFields,
} from "./shared.js";

const DEFAULT_CHAT_MODEL = "us.anthropic.claude-sonnet-4-6";

function buildGuardrailRuntimeConfig(guardrail) {
  if (!guardrail?.awsGuardrailId) return null;
  return {
    guardrailIdentifier: guardrail.awsGuardrailId,
    guardrailVersion: guardrail.awsGuardrailVersion || "DRAFT",
  };
}

function buildAgentRuntimeConfig(agent) {
  return {
    model: agent?.Model?.internalName || DEFAULT_CHAT_MODEL,
    modelID: agent?.modelID || null,
    modelParameters: agent?.modelParameters || null,
    systemPrompt: agent?.Prompt?.content || null,
    guardrailID: agent?.guardrailID || null,
    guardrailConfig: buildGuardrailRuntimeConfig(agent?.Guardrail),
    tools: (agent?.AgentTools || []).map((agentTool) => agentTool.Tool?.name).filter(Boolean),
  };
}

function hydrateAgent(agent) {
  if (!agent) return null;

  const result = { ...agent };
  result.runtime = buildAgentRuntimeConfig(result);
  result.systemPrompt = result.runtime.systemPrompt;
  result.tools = result.runtime.tools;
  return result;
}

async function requireMutableAgent(service, userId, agentId, { allowMissing = false } = {}) {
  const agent = await service.getAgent(userId, agentId);
  if (!agent) {
    if (allowMissing) return null;
    throw createNotFoundError("Agent not found");
  }
  if (agent.userID === null) {
    throw createForbiddenError("Cannot modify global agent");
  }
  return agent;
}

export const agentMethods = {
  async createAgent(userId, data) {
    const [agent] = await db
      .insert(Agent)
      .values({
        userID: userId,
        name: data.name,
        description: data.description || null,
        modelID: data.modelID || null,
        promptID: data.promptID || null,
        guardrailID: data.guardrailID || null,
        modelParameters: data.modelParameters || null,
      })
      .returning();

    if (Array.isArray(data.tools) && data.tools.length > 0) {
      const toolRecords = await db.select().from(Tool).where(inArray(Tool.name, data.tools));
      const agentTools = toolRecords.map((tool) => ({ agentID: agent.id, toolID: tool.id }));
      if (agentTools.length) {
        await db.insert(AgentTool).values(agentTools);
      }
    }

    return agent;
  },

  async getAgent(userId, agentId) {
    const agent = await db.query.Agent.findFirst({
      where: and(eq(Agent.id, agentId), agentReadCondition(userId)),
      with: {
        Model: { columns: { id: true, internalName: true, name: true, defaultParameters: true } },
        Prompt: { columns: { id: true, name: true, content: true } },
        Guardrail: {
          columns: {
            id: true,
            name: true,
            awsGuardrailId: true,
            awsGuardrailVersion: true,
          },
        },
        AgentTools: { with: { Tool: { columns: { name: true } } } },
      },
    });

    return hydrateAgent(agent);
  },

  async getAgents(userId) {
    const agents = await db.query.Agent.findMany({
      where: agentReadCondition(userId),
      with: {
        Model: { columns: { id: true, internalName: true, name: true, defaultParameters: true } },
        Prompt: { columns: { id: true, name: true, content: true } },
        Guardrail: {
          columns: {
            id: true,
            name: true,
            awsGuardrailId: true,
            awsGuardrailVersion: true,
          },
        },
        AgentTools: { with: { Tool: { columns: { name: true } } } },
      },
      orderBy: desc(Agent.createdAt),
    });

    return agents.map(hydrateAgent);
  },

  async updateAgent(userId, agentId, updates) {
    await requireMutableAgent(this, userId, agentId);

    const { tools, ...agentFields } = updates;
    const result = await db
      .update(Agent)
      .set(stripAutoFields(agentFields))
      .where(and(eq(Agent.id, agentId), eq(Agent.userID, userId)))
      .returning();
    if (result.length === 0) return null;

    if (Array.isArray(tools)) {
      await db.delete(AgentTool).where(eq(AgentTool.agentID, agentId));
      const toolRecords = await db.select().from(Tool).where(inArray(Tool.name, tools));
      const agentTools = toolRecords.map((tool) => ({ agentID: agentId, toolID: tool.id }));
      if (agentTools.length) {
        await db.insert(AgentTool).values(agentTools);
      }
    }

    return this.getAgent(userId, agentId);
  },

  async deleteAgent(userId, agentId) {
    const agent = await requireMutableAgent(this, userId, agentId, { allowMissing: true });
    if (!agent) return 0;

    const conversations = await db
      .select()
      .from(Conversation)
      .where(and(eq(Conversation.agentID, agentId), eq(Conversation.userID, userId)));

    for (const conversation of conversations) {
      await this.deleteConversation(userId, conversation.id);
    }

    const result = await db
      .delete(Agent)
      .where(and(eq(Agent.id, agentId), eq(Agent.userID, userId)));
    return getMutationCount(result);
  },

  async resolveAgentRuntimeConfig(userId, agentId, { modelOverride = null } = {}) {
    const agent = await this.getAgent(userId, agentId);
    if (!agent) return null;

    return {
      agent,
      runtime: {
        ...agent.runtime,
        overrideModel: modelOverride || null,
        effectiveModel: modelOverride || agent.runtime?.model || DEFAULT_CHAT_MODEL,
      },
    };
  },
};
