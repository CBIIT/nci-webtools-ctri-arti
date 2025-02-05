import { Router, json } from "express";
import cors from "cors";
import multer from "multer";
import { runModel, processDocuments, streamModel } from "./inference.js";
import { proxyMiddleware } from './middleware.js';
import { search, research } from './utils.js';

const api = Router();
const fieldSize = process.env.UPLOAD_FIELD_SIZE || 1024 * 1024 * 1024; // 1gb 
const upload = multer({limits: { fieldSize }});

api.use(cors());
api.use(json({ limit: fieldSize }));


api.get("/ping", (req, res) => {
  res.json(true);
});

api.all("/proxy", proxyMiddleware);

api.get("/search", async (req, res) => {
  const { q, limit } = req.query;
  res.json(await search({keywords: q, maxResults: limit})); 
});

api.get("/research", async (req, res) => {
  const { q, limit } = req.query;
  res.json(await research({topic: q}));
});

api.post("/submit", upload.any(), async (req, res) => {
  const { model, prompt, ids } = req.body;
  const results = await processDocuments(model, prompt, req.files);
  const mappedResults = ids.split(',').map((id, index) => ({ id, ...results[index] }));
  res.json(mappedResults);
});

api.get("/model/run", async (req, res) => {
  const { model, messages } = req.query;
  res.json(await runModel(model, messages));
});

api.post("/model/run", async (req, res) => {
  const { model, messages } = req.body;
  res.json(await runModel(model, messages));
});

api.get("/model/stream", async (req, res) => {
  const { model, messages } = req.query;
  const results = await streamModel(model, messages);
  for await (const message of results.stream) {
    const chunk = message?.contentBlockDelta?.delta?.text;
    if (chunk?.length > 0)
      res.write(chunk);
  }
  res.end();
});

api.post("/model/stream", async (req, res) => {
  const { model, messages } = req.body;
  const results = await streamModel(model, messages);
  for await (const message of results.stream) {
    const chunk = message?.contentBlockDelta?.delta?.text;
    if (chunk?.length > 0)
      res.write(chunk);
  }
  res.end();
});

export default api;

