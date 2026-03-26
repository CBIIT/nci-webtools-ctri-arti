import { Router } from "express";
import { routeHandler } from "shared/utils.js";

import { getTemplate, getTemplates } from "../core/templates.js";

export function createTemplatesRouter() {
  const api = Router();

  api.get(
    "/templates",
    routeHandler(async (_req, res) => {
      res.json(await getTemplates());
    })
  );

  api.get(
    "/templates/:templateId",
    routeHandler(async (req, res) => {
      try {
        res.json(await getTemplate(req.params.templateId));
      } catch {
        res.status(404).json({ error: "Template not found" });
      }
    })
  );

  return api;
}
