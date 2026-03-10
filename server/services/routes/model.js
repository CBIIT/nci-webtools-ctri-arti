import db, { Model } from "database";

import { eq } from "drizzle-orm";
import { json, Router } from "express";

import { amsClient } from "../clients/ams.js";
import { invoke, embed } from "../clients/gateway.js";
import { requireRole } from "../middleware.js";
import { createHttpError } from "../utils.js";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

/**
 * Resolve model to an integer ID.
 * Accepts either `modelID` (integer PK) or `model` (internalName string).
 */
async function resolveModelID(body) {
  if (body.modelID) return body.modelID;
  if (!body.model) return null;
  const [record] = await db.select().from(Model).where(eq(Model.internalName, body.model)).limit(1);
  return record?.id || null;
}

api.post("/model", requireRole(), async (req, res, next) => {
  const user = req.session.user;

  try {
    const { model: _model, modelID: _modelID, ...rest } = req.body;
    const modelID = await resolveModelID(req.body);
    if (!modelID) {
      return res.status(404).json({ error: "Model not found" });
    }

    const result = await invoke({
      modelID,
      userID: user.id,
      ...rest,
    });

    // Forward structured gateway errors
    if (result.error) {
      return res.status(result.error.httpStatus || 500).json(result);
    }

    // For non-streaming responses
    if (!result?.stream) {
      return res.json(result);
    }

    // For streaming responses
    for await (const message of result.stream) {
      try {
        res.write(JSON.stringify(message) + "\n");
      } catch (err) {
        console.error("Error processing stream message:", err);
      }
    }

    res.end();
  } catch (error) {
    console.error("Error in model API:", error);
    next(createHttpError(500, error, "An error occurred while processing the model request"));
  }
});

api.post("/model/embed", requireRole(), async (req, res, next) => {
  const user = req.session.user;

  try {
    const { texts, type, agentID } = req.body;
    const modelID = await resolveModelID(req.body);
    if (!modelID) {
      return res.status(404).json({ error: "Model not found" });
    }

    const result = await embed({
      modelID,
      userID: user.id,
      agentID,
      texts,
      type,
    });

    if (result?.error) {
      return res.status(result.error.httpStatus || 500).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("Error in embed API:", error);
    next(createHttpError(500, error, "An error occurred while processing the embedding request"));
  }
});

api.get("/model/list", requireRole(), async (req, res, next) => {
  try {
    const userId = req.session?.user?.id;
    if (amsClient) {
      const results = await amsClient.getModels(userId, { type: req.query.type });
      return res.json(results);
    }
    // Monolith mode: query DB directly
    const models = await db.query.Model.findMany({
      with: { Provider: { columns: { name: true } } },
    });
    const filtered = req.query.type ? models.filter((m) => m.type === req.query.type) : models;
    res.json(
      filtered.map((m) => ({
        modelID: m.id,
        name: m.name,
        type: m.type,
        description: m.description,
        providerName: m.Provider?.name || null,
        internalName: m.internalName,
        defaultParameters: m.defaultParameters,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }))
    );
  } catch (error) {
    console.error("Error listing models:", error);
    next(createHttpError(500, error, "An error occurred while fetching models"));
  }
});

export default api;
