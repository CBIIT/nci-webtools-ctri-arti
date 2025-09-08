import { json, Router } from "express";
import { QueryTypes } from "sequelize";

import db from "../database.js";
import { sendFeedback } from "../email.js";
import { proxyMiddleware, requireRole } from "../middleware.js";
import { textract } from "../textract.js";
import { getLanguages, translate } from "../translate.js";
import { search } from "../utils.js";

const { VERSION } = process.env;
const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

api.get("/status", async (req, res) => {
  res.json({
    version: VERSION,
    uptime: process.uptime(),
    database: await db.query("SELECT 'ok' AS health", { plain: true, type: QueryTypes.SELECT }),
  });
});

api.get("/search", requireRole(), async (req, res) => {
  res.json(await search(req.query));
});

api.all("/browse/*url", requireRole(), proxyMiddleware);

api.post("/textract", requireRole(), async (req, res) => {
  res.json(await textract(req.body));
});

api.post("/translate", requireRole(), async (req, res) => {
  res.json(await translate(req.body));
});

api.get("/translate/languages", requireRole(), async (req, res) => {
  res.json(await getLanguages());
});

api.post("/feedback", requireRole(), async (req, res) => {
  const { feedback, context } = req.body;
  const from = req.session?.user?.email;
  const results = await sendFeedback({ from, feedback, context });
  return res.json(results);
});

export default api;
