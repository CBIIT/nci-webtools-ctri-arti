import {
  Tool, KnowledgeBase, Model, Resource, Vector, AgentTool,
} from "../database.js";
import { serviceError } from "./utils.js";

function formatTool(t) {
  const json = t.toJSON();
  return {
    toolID: json.id,
    name: json.name,
    type: json.type,
    customConfig: json.customConfig,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

async function formatKnowledgeBase(tool) {
  const json = tool.toJSON();
  const config = json.customConfig || {};
  const kbId = config.knowledgeBaseId;

  let embeddingModelName = null;
  let rerankingModelName = null;
  let kb = null;

  if (kbId) {
    kb = await KnowledgeBase.findByPk(kbId, {
      include: [
        { model: Model, as: "embeddingModel", attributes: ["name"] },
        { model: Model, as: "rerankingModel", attributes: ["name"] },
      ],
    });
    embeddingModelName = kb?.embeddingModel?.name || null;
    rerankingModelName = kb?.rerankingModel?.name || null;
  }

  const resources = kbId
    ? await Resource.findAll({
        where: { knowledgeBaseId: kbId },
        order: [["createdAt", "ASC"]],
      })
    : [];

  return {
    toolID: json.id,
    name: json.name,
    description: kb?.description || null,
    embeddingModelName,
    rerankingModelName,
    configuration: kb?.configuration || null,
    files: resources.map((r) => ({
      fileName: r.name,
      metadata: r.metadata,
    })),
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

export async function getTools(userId) {
  const tools = await Tool.findAll({ order: [["id", "ASC"]] });
  return tools.map((t) => formatTool(t));
}

export async function createKnowledgeBase(userId, data) {
  const { name, description, embeddingModelID, rerankingModelID, configuration, files } = data;

  if (!name) throw serviceError(400, "name is required");
  if (!description) throw serviceError(400, "description is required");
  if (!embeddingModelID) throw serviceError(400, "embeddingModelID is required");
  if (!rerankingModelID) throw serviceError(400, "rerankingModelID is required");
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw serviceError(400, "files array is required");
  }

  const kb = await KnowledgeBase.create({
    name,
    description,
    embeddingModelId: embeddingModelID,
    rerankingModelId: rerankingModelID,
    configuration: configuration || null,
  });

  const customConfig = {
    McpType: "knowledgebase",
    knowledgeBaseId: kb.id,
  };

  const tool = await Tool.create({ name, type: "mcp", customConfig });

  if (files && files.length > 0) {
    await Resource.bulkCreate(
      files.map((f) => ({
        knowledgeBaseId: kb.id,
        name: f.fileName,
        metadata: f.metadata || {},
      }))
    );
  }

  return formatKnowledgeBase(tool);
}

export async function getKnowledgeBases(userId) {
  const tools = await Tool.findAll({ order: [["id", "ASC"]] });
  const kbs = tools.filter((t) => t.customConfig?.McpType === "knowledgebase");
  return Promise.all(kbs.map((t) => formatKnowledgeBase(t)));
}

export async function getKnowledgeBase(userId, id) {
  const tool = await Tool.findByPk(id);
  if (!tool || tool.customConfig?.McpType !== "knowledgebase") {
    throw serviceError(404, "KnowledgeBase not found");
  }
  return formatKnowledgeBase(tool);
}

export async function updateKnowledgeBase(userId, id, data) {
  const tool = await Tool.findByPk(id);
  if (!tool || tool.customConfig?.McpType !== "knowledgebase") {
    throw serviceError(404, "KnowledgeBase not found");
  }

  const kbId = tool.customConfig?.knowledgeBaseId;
  const { name, description, embeddingModelID, rerankingModelID, configuration, files } = data;

  // Update KnowledgeBase record
  if (kbId) {
    const kbUpdates = {};
    if (embeddingModelID !== undefined) kbUpdates.embeddingModelId = embeddingModelID;
    if (rerankingModelID !== undefined) kbUpdates.rerankingModelId = rerankingModelID;
    if (description !== undefined) kbUpdates.description = description;
    if (configuration !== undefined) kbUpdates.configuration = configuration;
    if (name !== undefined) kbUpdates.name = name;
    if (Object.keys(kbUpdates).length > 0) {
      await KnowledgeBase.update(kbUpdates, { where: { id: kbId } });
    }
  }

  // Update Tool record
  const toolUpdates = {};
  if (name !== undefined) toolUpdates.name = name;
  if (Object.keys(toolUpdates).length > 0) {
    await Tool.update(toolUpdates, { where: { id } });
  }

  if (files && files.length > 0) {
    await Resource.bulkCreate(
      files.map((f) => ({
        knowledgeBaseId: kbId,
        name: f.fileName,
        metadata: f.metadata || {},
      }))
    );
  }

  const updated = await Tool.findByPk(id);
  return formatKnowledgeBase(updated);
}

export async function deleteKnowledgeBase(userId, id) {
  const tool = await Tool.findByPk(id);
  if (!tool || tool.customConfig?.McpType !== "knowledgebase") {
    throw serviceError(404, "KnowledgeBase not found");
  }

  const kbId = tool.customConfig?.knowledgeBaseId;
  if (kbId) {
    const resourceIds = (
      await Resource.findAll({ where: { knowledgeBaseId: kbId }, attributes: ["id"] })
    ).map((r) => r.id);
    if (resourceIds.length > 0) {
      await Vector.destroy({ where: { resourceId: resourceIds } });
    }
    await Resource.destroy({ where: { knowledgeBaseId: kbId } });
    await KnowledgeBase.destroy({ where: { id: kbId } });
  }
  await AgentTool.destroy({ where: { toolId: id } });
  await Tool.destroy({ where: { id } });

  return { success: true };
}

export async function deleteKnowledgeBaseFile(userId, id, files) {
  const tool = await Tool.findByPk(id);
  if (!tool || tool.customConfig?.McpType !== "knowledgebase") {
    throw serviceError(404, "KnowledgeBase not found");
  }

  if (!files || !Array.isArray(files) || files.length === 0) {
    throw serviceError(400, "files array is required");
  }

  const kbId = tool.customConfig?.knowledgeBaseId;
  for (const file of files) {
    const resource = await Resource.findOne({
      where: { knowledgeBaseId: kbId, name: file.fileName },
    });
    if (resource) {
      await Vector.destroy({ where: { resourceId: resource.id } });
      await Resource.destroy({ where: { id: resource.id } });
    }
  }

  return { success: true };
}
