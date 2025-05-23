import { Router, json } from "express";
import { QueryTypes } from "sequelize";
import { authMiddleware, proxyMiddleware } from "../middleware.js";
import { search } from "../utils.js";
import { translate, getLanguages } from "../translate.js";
import { sendFeedback } from "../email.js";
import db from "../database.js";

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

api.get("/search", authMiddleware, async (req, res) => {
  res.json(await search(req.query));
});

api.all("/browse/*url", authMiddleware, proxyMiddleware);

api.post("/translate", authMiddleware, async (req, res) => {
  res.json(await translate(req.body));
});

api.get("/translate/languages", authMiddleware, async (req, res) => {
  res.json(await getLanguages());
});

api.post("/feedback", authMiddleware, async (req, res) => {
  const { feedback, context } = req.body;
  const from = req.session.user?.userinfo?.email;
  const results = await sendFeedback({ from, feedback, context });
  return res.json(results);
});

export default api;
