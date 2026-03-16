import db, { rawSql } from "database";

import { json, Router } from "express";
import { requireRole } from "users/middleware.js";

import { sendFeedback, sendLogReport, sendJustificationEmail } from "../email.js";
import { parseDocument } from "../parsers.js";
import { proxyMiddleware } from "../proxy.js";
import { getFile, listFiles } from "../s3.js";
import { textract } from "../textract.js";
import { getLanguages, translate } from "../translate.js";
import { getAuthenticatedUser, getRequestContext, search } from "../utils.js";

const { VERSION, S3_BUCKETS, EMAIL_DEV, EMAIL_ADMIN, EMAIL_USER_REPORTS } = process.env;
const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB

api.get("/status", async (req, res) => {
  const [health] = await rawSql`SELECT 'ok' AS health`;
  res.json({
    version: VERSION,
    uptime: process.uptime(),
    database: health,
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
  const context = getRequestContext(req);
  const result = await translate(req.body);

  // Track translate usage
  const chars = req.body.text?.length || 0;
  if (context.userId && chars > 0) {
    try {
      const { trackUsage } = await import("gateway/usage.js");
      await trackUsage(context.userId, "aws-translate", [{ quantity: chars, unit: "characters" }], {
        type: "translate",
        requestId: context.requestId,
      });
    } catch (err) {
      console.error("Failed to track translate usage:", err.message);
    }
  }

  res.json(result);
});

api.get("/translate/languages", requireRole(), async (req, res) => {
  res.json(await getLanguages());
});

api.post("/feedback", requireRole(), async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { feedback, context } = req.body;
  const results = await sendFeedback({ from: user.email, feedback, context });
  return res.json(results);
});

api.post("/log", requireRole(), async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { metadata, reportSource } = req.body;

  const recipient =
    reportSource?.toUpperCase() === "USER" ? EMAIL_USER_REPORTS || EMAIL_ADMIN : EMAIL_DEV;

  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "N/A";

  const logData = {
    reportSource,
    userId: user?.id || "N/A",
    userName,
    metadata,
    recipient,
  };

  const results = await sendLogReport(logData);
  return res.json(results);
});

function getMimeTypeFromKey(key) {
  const ext = key.split(".").pop()?.toLowerCase();
  const mimeTypes = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    json: "application/json",
    csv: "text/csv",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

api.get("/data", requireRole(), async (req, res) => {
  const { bucket, key, raw } = req.query;
  if (!S3_BUCKETS?.split(",").includes(bucket)) {
    return res.status(400).json({ error: "Invalid bucket" });
  }

  if (!key || key?.endsWith("/")) {
    const files = await listFiles(bucket);
    return res.json(files);
  } else {
    const data = await getFile(bucket, key);
    const contentType = data.ContentType || getMimeTypeFromKey(key);

    // Return raw binary content if raw=true is requested
    if (raw === "true") {
      res.setHeader("Content-Type", contentType);
      return data.Body.pipe(res);
    }

    // Parse document types that need text extraction
    const documentTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (documentTypes.includes(contentType)) {
      const chunks = [];
      for await (const chunk of data.Body) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const text = await parseDocument(buffer, contentType);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.send(text);
    }

    // For other files, pipe raw content
    return data.Body.pipe(res);
  }
});

api.post("/usage", requireRole(), async (req, res) => {
  const user = getAuthenticatedUser(req);
  const { justification } = req.body;
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "N/A";
  const userEmail = user?.email;
  const currentLimit = user?.budget;
  const emailData = {
    justification,
    userName,
    userEmail,
    currentLimit,
  };

  const results = await sendJustificationEmail(emailData);
  return res.json(results);
});

export default api;
