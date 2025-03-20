import { Router, json } from "express";
import cors from "cors";
import multer from "multer";
import { runModel, processDocuments } from "./inference.js";
import { proxyMiddleware } from "./middleware.js";
import { braveSearch as search } from "./utils.js";

const api = Router();
const fieldSize = process.env.UPLOAD_FIELD_SIZE || 1024 * 1024 * 1024; // 1gb
const upload = multer({ limits: { fieldSize } });

api.use(cors());
api.use(json({ limit: fieldSize }));

api.get("/ping", (req, res) => {
  res.json(true);
});

api.all("/proxy/*url", proxyMiddleware);

api.get("/search", async (req, res) => {
  res.json(await search(req.query));
});

api.all("/model/run", async (req, res) => {
  const useQuery = req.method === "GET";
  const useBody = req.method === "POST";
  if (!useQuery && !useBody) {
    res.status(405).end();
    return;
  }
  let { model, messages, system, thoughtBudget, tools, stream } = useQuery ? req.query : req.body;
  if (useQuery) {
    messages = JSON.parse(messages || "[]");
    tools = JSON.parse(tools || "[]");
  }
  const results = await runModel(model, messages, system, thoughtBudget, tools, stream);
  if (stream) {
    for await (const message of results?.stream || []) {
      res.write(JSON.stringify(message) + "\n");
    }
    res.end();
  } else {
    res.json(results);
  }
});

api.post("/submit", upload.any(), async (req, res) => {
  const { model, prompt, ids } = req.body;
  const results = await processDocuments(model, prompt, req.files);
  const mappedResults = ids.split(",").map((id, index) => ({ id, ...results[index] }));
  res.json(mappedResults);
});

export default api;
