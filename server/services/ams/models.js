import { Model, Provider } from "../database.js";
import { serviceError } from "./utils.js";

function formatModel(m) {
  const json = m.toJSON();
  return {
    modelID: json.id,
    name: json.name,
    type: json.type,
    description: json.description,
    providerName: json.Provider?.name || null,
    internalName: json.internalName,
    defaultParameters: json.defaultParameters,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

export async function getModels(userId, query = {}) {
  const models = await Model.findAll({
    include: [{ model: Provider, attributes: ["name"] }],
    order: [["id", "ASC"]],
  });
  return models.map((m) => formatModel(m));
}

export async function getModel(userId, modelId, query = {}) {
  const where = { id: modelId };
  if (query.type) where.type = query.type;
  const model = await Model.findOne({
    where,
    include: [{ model: Provider, attributes: ["name"] }],
  });
  if (!model) throw serviceError(404, "Model not found");
  return formatModel(model);
}
