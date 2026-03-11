import db, { Model } from "database";

import { eq } from "drizzle-orm";
import { Router } from "express";
import { routeHandler } from "shared/utils.js";

const router = Router();

router.get(
  "/",
  routeHandler(async (req, res) => {
    const { type } = req.query;
    const models = await db.query.Model.findMany({
      with: { Provider: { columns: { name: true } } },
    });

    const filtered = type ? models.filter((m) => m.type === type) : models;
    res.json(filtered.map(formatModel));
  })
);

router.get(
  "/:id",
  routeHandler(async (req, res) => {
    const model = await db.query.Model.findFirst({
      where: eq(Model.id, Number(req.params.id)),
      with: { Provider: { columns: { name: true } } },
    });

    if (!model) return res.status(404).json({ error: "Model not found" });
    res.json(formatModel(model));
  })
);

function formatModel(model) {
  return {
    modelID: model.id,
    name: model.name,
    type: model.type,
    description: model.description,
    providerName: model.Provider?.name || null,
    internalName: model.internalName,
    defaultParameters: model.defaultParameters,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

export default router;
