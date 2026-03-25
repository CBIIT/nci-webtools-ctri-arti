import { Router } from "express";

import { sendNotFound } from "./helpers.js";

export function createCmsTemplatesRouter({ application } = {}) {
  if (!application) {
    throw new Error("cms application is required");
  }

  const api = Router();

  api.get("/templates", async (_req, res) => {
    const templates = await application.getTemplates();
    res.json(templates);
  });

  api.get("/templates/:id", async (req, res) => {
    const template = await application.getTemplate(Number(req.params.id));
    if (!template) return sendNotFound(res, "Template");
    res.json(template);
  });

  return api;
}
