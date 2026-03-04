import { Op } from "sequelize";
import {
  Agent, Prompt, Model, AgentTool, Conversation,
} from "../database.js";
import { serviceError } from "./utils.js";
import { deleteConversationCascade } from "./conversations.js";

const agentIncludes = [
  { model: Prompt, attributes: ["id", "name", "content"] },
  { model: Model, attributes: ["id", "name"] },
  { model: AgentTool, attributes: ["toolId"] },
];

function formatAgent(agent) {
  const json = agent.toJSON();
  return {
    agentID: json.id,
    name: json.name,
    description: json.description,
    systemPrompt: json.Prompt?.content || null,
    modelName: json.Model?.name || null,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

async function findAgent(userId, agentId) {
  return Agent.findOne({
    where: {
      id: agentId,
      [Op.or]: [{ creatorId: userId }, { creatorId: null }],
    },
    include: agentIncludes,
  });
}

export async function createAgent(userId, data) {
  const { name, description, systemPrompt, modelID, modelParameters, toolIDs } = data;

  if (!name) throw serviceError(400, "name is required");
  if (!description) throw serviceError(400, "description is required");
  if (!systemPrompt) throw serviceError(400, "systemPrompt is required");
  if (!modelID) throw serviceError(400, "modelID is required");

  let promptId = null;
  if (systemPrompt) {
    const prompt = await Prompt.create({ content: systemPrompt, name });
    promptId = prompt.id;
  }

  const agent = await Agent.create({
    creatorId: userId,
    name,
    description,
    promptId,
    modelId: modelID || null,
    modelParameters: modelParameters || null,
  });

  if (toolIDs && toolIDs.length > 0) {
    await AgentTool.bulkCreate(toolIDs.map((toolId) => ({ agentId: agent.id, toolId })));
  }

  const result = await findAgent(userId, agent.id);
  return formatAgent(result);
}

export async function getAgents(userId) {
  const agents = await Agent.findAll({
    where: {
      [Op.or]: [{ creatorId: userId }, { creatorId: null }],
    },
    include: agentIncludes,
    order: [["createdAt", "DESC"]],
  });
  return agents.map((a) => formatAgent(a));
}

export async function getAgent(userId, agentId) {
  const agent = await findAgent(userId, agentId);
  if (!agent) throw serviceError(404, "Agent not found");
  return formatAgent(agent);
}

export async function updateAgent(userId, agentId, data) {
  const existing = await findAgent(userId, agentId);
  if (!existing) throw serviceError(404, "Agent not found");
  if (existing.creatorId === null) {
    throw serviceError(403, "Cannot modify global agent");
  }

  const { name, description, systemPrompt, modelID, modelParameters, toolIDs } = data;

  if (systemPrompt !== undefined) {
    if (existing.promptId) {
      await Prompt.update({ content: systemPrompt }, { where: { id: existing.promptId } });
    } else {
      const prompt = await Prompt.create({ content: systemPrompt, name: existing.name });
      await Agent.update({ promptId: prompt.id }, { where: { id: agentId, creatorId: userId } });
    }
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (modelID !== undefined) updates.modelId = modelID;
  if (modelParameters !== undefined) updates.modelParameters = modelParameters;
  if (Object.keys(updates).length > 0) {
    await Agent.update(updates, { where: { id: agentId, creatorId: userId } });
  }

  if (toolIDs !== undefined) {
    await AgentTool.destroy({ where: { agentId } });
    if (toolIDs.length > 0) {
      await AgentTool.bulkCreate(toolIDs.map((toolId) => ({ agentId: parseInt(agentId), toolId })));
    }
  }

  const result = await findAgent(userId, agentId);
  return formatAgent(result);
}

export async function deleteAgent(userId, agentId) {
  const existing = await findAgent(userId, agentId);
  if (!existing) throw serviceError(404, "Agent not found");
  if (existing.creatorId === null) {
    throw serviceError(403, "Cannot delete global agent");
  }

  await AgentTool.destroy({ where: { agentId } });

  const conversations = await Conversation.findAll({
    where: { agentId, userId },
    attributes: ["id"],
  });
  for (const conv of conversations) {
    await deleteConversationCascade(conv.id);
  }

  await Agent.destroy({ where: { id: agentId, creatorId: userId } });
  return { success: true };
}
