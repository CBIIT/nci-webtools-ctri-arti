import db, { Model, User } from "database";

import { and, eq } from "drizzle-orm";
import { json, Router } from "express";
import { describeCron } from "shared/cron.js";
import logger from "shared/logger.js";
import { logErrors, logRequests } from "shared/middleware.js";

import { runModel } from "./chat.js";
import { runEmbedding } from "./embedding.js";
import { normalizeProviderError, sendError } from "./errors.js";
import { applyGuardrail, guardrailsEnabled } from "./guardrails.js";
import BedrockProvider from "./providers/bedrock.js";
import { trackModelUsage } from "./usage.js";

const guardrailProvider = guardrailsEnabled ? new BedrockProvider() : null;

function logUsage(action, model, usage, latencyMs, { guardrailCost, ...extra } = {}) {
  const inputTokens = usage?.inputTokens || 0;
  const outputTokens = usage?.outputTokens || 0;
  const cacheRead = usage?.cacheReadInputTokens || 0;
  const cacheWrite = usage?.cacheWriteInputTokens || 0;
  const cost =
    (inputTokens / 1000) * (model.cost1kInput || 0) +
    (outputTokens / 1000) * (model.cost1kOutput || 0) +
    (cacheRead / 1000) * (model.cost1kCacheRead || 0) +
    (cacheWrite / 1000) * (model.cost1kCacheWrite || 0);

  const logEntry = {
    action,
    model: model.name,
    ...extra,
    usage: { inputTokens, outputTokens, cacheRead },
    cost: `$${cost.toFixed(2)}`,
  };
  if (guardrailCost > 0) {
    logEntry.guardrailCost = `$${guardrailCost.toFixed(2)}`;
  }
  logEntry.latencyMs = latencyMs;

  logger.info(logEntry);
}

const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";

const api = Router();
api.use(json({ limit: 1024 ** 3 })); // 1GB
api.use(
  logRequests((req) => {
    const { action, modelID, userID, stream } = req.body || {};
    return [`${req.method} ${req.path}`, { action, modelID, userID, stream }];
  })
);

/**
 * POST /v1/modelInvoke - Unified inference endpoint.
 * Routes to chat or embedding handler based on the `action` field.
 *
 * Required: action, modelID, userID
 * Optional: agentID, messages, stream, defaultParameters, tools, system
 */
api.post("/v1/modelInvoke", async (req, res, next) => {
  const {
    action,
    modelID,
    userID,
    agentID,
    messages,
    system,
    tools,
    stream,
    defaultParameters = {},
    type,
  } = req.body;

  try {
    // Validate required fields
    const missingFields = [];
    if (!action) missingFields.push("action");
    if (!modelID) missingFields.push("modelID");
    if (!userID) missingFields.push("userID");
    if (missingFields.length > 0) {
      return sendError(
        res,
        "MISSING_REQUIRED_FIELD",
        `Missing required fields: ${missingFields.join(", ")}`,
        { missingFields }
      );
    }

    if (action !== "chat" && action !== "embedding") {
      return sendError(res, "INVALID_ACTION", "Invalid action. Must be 'chat' or 'embedding'");
    }

    // Resolve model by primary key
    const [model] = await db.select().from(Model).where(eq(Model.id, modelID)).limit(1);
    if (!model) {
      return sendError(res, "INVALID_MODEL", `Model not found: ${modelID}`);
    }

    // Rate limit check
    const [user] = await db.select().from(User).where(eq(User.id, userID)).limit(1);
    if (user?.budget !== null && user?.remaining !== null && user?.remaining <= 0) {
      const { resetDescription } = describeCron(USAGE_RESET_SCHEDULE);
      return sendError(
        res,
        "QUOTA_EXCEEDED",
        `You have reached your allocated usage limit. Your access to the chat tool is temporarily disabled and will reset ${resetDescription}. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.`
      );
    }

    // Embedding
    if (action === "embedding") {
      // messages can be an array of strings or chat-format array
      const texts = Array.isArray(messages)
        ? messages.map((m) => (typeof m === "string" ? m : m.content || ""))
        : [];

      if (texts.length === 0) {
        return sendError(
          res,
          "INVALID_MESSAGES_FORMAT",
          "Embedding requires a non-empty messages array of strings"
        );
      }

      const result = await runEmbedding({ model, texts });
      if (!result) {
        return sendError(res, "PROVIDER_ERROR", "Embedding returned no result");
      }

      await trackModelUsage(
        userID,
        model,
        { inputTokens: result.usage.promptTokens, outputTokens: 0 },
        { type, agentID }
      );
      logUsage(
        "embedding",
        model,
        { inputTokens: result.usage.promptTokens },
        Date.now() - req.startTime
      );
      return res.json(result);
    }

    // Chat inference
    const { thoughtBudget = 0, outputConfig } = defaultParameters;
    let guardrailCost = 0;

    // Input guardrail check
    if (guardrailProvider) {
      const inputCheck = await applyGuardrail(guardrailProvider, "INPUT", messages);
      guardrailCost += inputCheck.cost;
      if (inputCheck.cost > 0) {
        await trackModelUsage(
          userID,
          model,
          { inputTokens: 0, outputTokens: 0 },
          { type: "guardrail", agentID, guardrailCost: inputCheck.cost }
        );
      }
      if (inputCheck.blocked) {
        return sendError(
          res,
          "GUARDRAIL_BLOCKED",
          inputCheck.output || "Input blocked by guardrail"
        );
      }
    }

    const results = await runModel({
      model,
      messages,
      system,
      tools,
      thoughtBudget,
      stream,
      outputConfig,
    });

    // Non-streaming response
    if (!results?.stream) {
      // Output guardrail check
      if (guardrailProvider) {
        const outputText = results?.output?.message?.content;
        const outputCheck = await applyGuardrail(guardrailProvider, "OUTPUT", outputText);
        guardrailCost += outputCheck.cost;
        if (outputCheck.cost > 0) {
          await trackModelUsage(
            userID,
            model,
            { inputTokens: 0, outputTokens: 0 },
            { type: "guardrail", agentID, guardrailCost: outputCheck.cost }
          );
        }
        if (outputCheck.blocked) {
          return sendError(
            res,
            "GUARDRAIL_BLOCKED",
            outputCheck.output || "Output blocked by guardrail"
          );
        }
      }

      await trackModelUsage(userID, model, results.usage, { type, agentID });
      logUsage("chat", model, results.usage, Date.now() - req.startTime, { guardrailCost });
      return res.json(results);
    }

    // Streaming response
    let streamUsage = null;
    for await (const message of results.stream) {
      try {
        if (message.metadata) {
          streamUsage = message.metadata.usage;
          await trackModelUsage(userID, model, streamUsage, { type, agentID });
        }
        res.write(JSON.stringify(message) + "\n");
      } catch (err) {
        console.error("Error processing stream message:", err);
      }
    }
    logUsage("chat", model, streamUsage, Date.now() - req.startTime, {
      stream: true,
      guardrailCost,
    });
    res.end();
  } catch (error) {
    console.error("Error in gateway modelInvoke:", error);
    const { errorType, message } = normalizeProviderError(error);
    return sendError(res, errorType, message);
  }
});

/**
 * GET /v1/models - List available models with optional type filter.
 * Includes model `id` so callers can use it for modelInvoke.
 */
api.get("/v1/models", async (req, res) => {
  const where = [eq(Model.providerID, 1)];
  if (req.query.type) where.push(eq(Model.type, req.query.type));

  const results = await db
    .select({
      id: Model.id,
      name: Model.name,
      internalName: Model.internalName,
      type: Model.type,
      maxContext: Model.maxContext,
      maxOutput: Model.maxOutput,
      maxReasoning: Model.maxReasoning,
    })
    .from(Model)
    .where(and(...where));
  res.json(results);
});

api.use(logErrors());

export default api;
export { trackModelUsage };
