import { randomUUID } from "crypto";

import { runWorkflow } from "agents/workflows/index.js";
import { Router } from "express";

import { getRequestContext, routeHandler } from "../utils.js";

const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour
const jobs = new Map();

function cleanExpiredJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(jobId);
    }
  }
}

export function createProtocolAdvisorRouter({ modules } = {}) {
  if (!modules?.gateway) {
    throw new Error("gateway module is required");
  }

  const api = Router();

  api.post(
    "/protocol-advisor/analyze",
    routeHandler(async (req, res) => {
      const { userId, requestId } = getRequestContext(req);
      const { templateId, protocolText, document } = req.body;

      if (!templateId || typeof templateId !== "string") {
        return res.status(400).json({ error: "templateId is required" });
      }

      const hasProtocolText = typeof protocolText === "string" && protocolText.trim().length > 0;
      const hasDocument = !!document?.bytes;

      if (!hasProtocolText && !hasDocument) {
        return res.status(400).json({ error: "protocolText or document.bytes is required" });
      }

      const existingJob = [...jobs.values()].find(
        (j) =>
          String(j.userId) === String(userId) &&
          j.templateId === templateId &&
          j.status === "running"
      );
      if (existingJob) {
        return res.status(200).json({ jobId: existingJob.jobId, status: "running" });
      }

      const jobId = randomUUID();
      const job = {
        jobId,
        status: "running",
        userId,
        templateId,
        progress: [],
        report: null,
        error: null,
        createdAt: Date.now(),
      };
      jobs.set(jobId, job);

      // Fire-and-forget: run workflow in background
      const input = { templateId, protocolText, document };
      const services = {
        gateway: modules.gateway,
        users: modules.users,
        userId,
        requestId,
      };

      runWorkflow("protocol_advisor", input, { services })
        .then((result) => {
          job.status = "completed";
          job.report = result.output;
          job.progress = result.context?.progress || [];
        })
        .catch((err) => {
          job.status = "failed";
          job.error = err.message;
        });

      cleanExpiredJobs();

      res.status(202).json({ jobId, status: "running" });
    })
  );

  api.get(
    "/protocol-advisor/jobs/:jobId",
    routeHandler(async (req, res) => {
      const { userId } = getRequestContext(req);
      const job = jobs.get(req.params.jobId);

      // 404 for missing jobs AND mismatched userId (prevents enumeration)
      if (!job || String(job.userId) !== String(userId)) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        report: job.report,
        error: job.error,
      });
    })
  );

  return api;
}

export default createProtocolAdvisorRouter;
