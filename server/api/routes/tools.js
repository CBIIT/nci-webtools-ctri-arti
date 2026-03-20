import { getSchemaReadiness } from "database/readiness.js";
import { json, Router } from "express";
import { JSON_BODY_LIMIT } from "shared/http-limits.js";

import { requireRole } from "../../auth.js";
import { sendFeedback, sendLogReport, sendJustificationEmail } from "../../integrations/email.js";
import { parseDocument } from "../../integrations/parsers.js";
import { proxyMiddleware } from "../../integrations/proxy.js";
import { getFile, listFiles } from "../../integrations/s3.js";
import { textract } from "../../integrations/textract.js";
import { getLanguages, translate } from "../../integrations/translate.js";
import { getAuthenticatedUser, getRequestContext, search } from "../utils.js";

const { VERSION, S3_BUCKETS, EMAIL_DEV, EMAIL_ADMIN, EMAIL_USER_REPORTS } = process.env;

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

export function createToolsRouter({
  modules,
  sendFeedbackImpl = sendFeedback,
  sendLogReportImpl = sendLogReport,
  sendJustificationEmailImpl = sendJustificationEmail,
} = {}) {
  if (!modules?.gateway) {
    throw new Error("gateway module is required");
  }

  const { gateway } = modules;
  const api = Router();
  api.use(json({ limit: JSON_BODY_LIMIT }));

  api.get("/status", async (req, res) => {
    const readiness = await getSchemaReadiness();
    res.json({
      version: VERSION,
      uptime: process.uptime(),
      database: {
        health: readiness.ready ? "ok" : "waiting",
        ...readiness,
      },
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

    const chars = req.body.text?.length || 0;
    if (context.userId && chars > 0) {
      try {
        await gateway.trackUsage(
          context.userId,
          "aws-translate",
          [{ quantity: chars, unit: "characters" }],
          {
            type: "translate",
            requestId: context.requestId,
          }
        );
      } catch (error) {
        console.error("Failed to track translate usage:", error.message);
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
    const results = await sendFeedbackImpl({ from: user.email, feedback, context });
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

    const results = await sendLogReportImpl(logData);
    return res.json(results);
  });

  api.get("/data", requireRole(), async (req, res) => {
    const { bucket, key, raw } = req.query;
    if (!S3_BUCKETS?.split(",").includes(bucket)) {
      return res.status(400).json({ error: "Invalid bucket" });
    }

    if (!key || key?.endsWith("/")) {
      const files = await listFiles(bucket);
      return res.json(files);
    }

    const data = await getFile(bucket, key);
    const contentType = data.ContentType || getMimeTypeFromKey(key);

    if (raw === "true") {
      res.setHeader("Content-Type", contentType);
      return data.Body.pipe(res);
    }

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

    return data.Body.pipe(res);
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

    const results = await sendJustificationEmailImpl(emailData);
    return res.json(results);
  });

  return api;
}

export default createToolsRouter;
