import { Router, json } from "express";
import cors from "cors";
import multer from "multer";
import { runModel, processDocuments, processDocument } from "./inference.js";

const api = Router();
const fieldSize = process.env.UPLOAD_FIELD_SIZE || 1024 * 1024 * 1024; // 1gb 
const upload = multer({limits: { fieldSize }});

api.use(cors());
api.use(json({ limit: fieldSize }));

api.get("/ping", (req, res) => {
  res.json(true);
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

export default api;

