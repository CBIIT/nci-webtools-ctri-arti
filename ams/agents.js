import db, { Agent, AgentTool, Conversation, Message, Prompt } from "database";

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Router } from "express";
import { routeHandler } from "shared/utils.js";

const router = Router();

router.post(
  "/",
  routeHandler(async (req, res) => {
    const { name, description, systemPrompt, modelID, modelParameters, toolIDs } = req.body;
    if (!name || !description || !systemPrompt || !modelID) {
      return res
        .status(400)
        .json({ error: "name, description, systemPrompt, and modelID are required" });
    }

    // Create prompt for systemPrompt
    const [prompt] = await db
      .insert(Prompt)
      .values({ name: `${name}_prompt`, version: 1, content: systemPrompt })
      .returning();

    // Create agent
    const [agent] = await db
      .insert(Agent)
      .values({
        userID: req.userId,
        name,
        description,
        modelID,
        promptID: prompt.id,
        modelParameters: modelParameters || null,
      })
      .returning();

    // Link tools
    if (Array.isArray(toolIDs) && toolIDs.length > 0) {
      const agentTools = toolIDs.map((toolID) => ({ agentID: agent.id, toolID }));
      await db.insert(AgentTool).values(agentTools);
    }

    const result = await getAgentWithRelations(req.userId, agent.id);
    res.status(201).json(result);
  })
);

router.get(
  "/",
  routeHandler(async (req, res) => {
    const agents = await db.query.Agent.findMany({
      where: or(eq(Agent.userID, req.userId), isNull(Agent.userID)),
      with: {
        Prompt: { columns: { content: true } },
        Model: { columns: { name: true } },
        AgentTools: { columns: { toolID: true } },
      },
      orderBy: desc(Agent.createdAt),
    });

    res.json(agents.map(formatAgent));
  })
);

router.get(
  "/:id",
  routeHandler(async (req, res) => {
    const agent = await getAgentWithRelations(req.userId, Number(req.params.id));
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json(agent);
  })
);

router.put(
  "/:id",
  routeHandler(async (req, res) => {
    const agentId = Number(req.params.id);
    const { name, description, systemPrompt, modelID, modelParameters, toolIDs } = req.body;

    // Verify ownership
    const existing = await db.query.Agent.findFirst({
      where: and(eq(Agent.id, agentId), or(eq(Agent.userID, req.userId), isNull(Agent.userID))),
    });
    if (!existing) return res.status(404).json({ error: "Agent not found" });
    if (existing.userID === null) {
      return res.status(403).json({ error: "Cannot modify global agent" });
    }

    // Update agent fields
    const agentUpdates = {};
    if (name !== undefined) agentUpdates.name = name;
    if (description !== undefined) agentUpdates.description = description;
    if (modelID !== undefined) agentUpdates.modelID = modelID;
    if (modelParameters !== undefined) agentUpdates.modelParameters = modelParameters;

    // Update systemPrompt via Prompt table
    if (systemPrompt !== undefined && existing.promptID) {
      await db
        .update(Prompt)
        .set({ content: systemPrompt })
        .where(eq(Prompt.id, existing.promptID));
    }

    if (Object.keys(agentUpdates).length > 0) {
      await db.update(Agent).set(agentUpdates).where(eq(Agent.id, agentId));
    }

    // Sync tools
    if (Array.isArray(toolIDs)) {
      await db.delete(AgentTool).where(eq(AgentTool.agentID, agentId));
      if (toolIDs.length > 0) {
        const agentTools = toolIDs.map((toolID) => ({ agentID: agentId, toolID }));
        await db.insert(AgentTool).values(agentTools);
      }
    }

    const result = await getAgentWithRelations(req.userId, agentId);
    res.json(result);
  })
);

router.delete(
  "/:id",
  routeHandler(async (req, res) => {
    const agentId = Number(req.params.id);

    // Cascade: delete conversations and their messages
    const conversations = await db
      .select({ id: Conversation.id })
      .from(Conversation)
      .where(and(eq(Conversation.agentID, agentId), eq(Conversation.userID, req.userId)));

    if (conversations.length > 0) {
      const conversationIds = conversations.map((c) => c.id);
      await db.delete(Message).where(inArray(Message.conversationID, conversationIds));
      await db.delete(Conversation).where(inArray(Conversation.id, conversationIds));
    }

    await db.delete(AgentTool).where(eq(AgentTool.agentID, agentId));
    await db.delete(Agent).where(and(eq(Agent.id, agentId), eq(Agent.userID, req.userId)));
    res.json({ success: true });
  })
);

async function getAgentWithRelations(userId, agentId) {
  const agent = await db.query.Agent.findFirst({
    where: and(eq(Agent.id, agentId), or(eq(Agent.userID, userId), isNull(Agent.userID))),
    with: {
      Prompt: { columns: { content: true } },
      Model: { columns: { name: true } },
      AgentTools: { columns: { toolID: true } },
    },
  });
  if (!agent) return null;
  return formatAgent(agent);
}

function formatAgent(agent) {
  return {
    agentID: agent.id,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.Prompt?.content || null,
    modelID: agent.modelID,
    modelName: agent.Model?.name || null,
    modelParameters: agent.modelParameters,
    toolIDs: (agent.AgentTools || []).map((at) => at.toolID),
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export { getAgentWithRelations };
export default router;
