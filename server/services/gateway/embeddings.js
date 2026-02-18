import { Router } from "express";
import BedrockProvider from "./providers/bedrock.js";
import logger from "../logger.js";
import { Usage } from "../database.js";
import { ErrorType, sendError, getProviderErrorType } from "./errors.js";
import { getGuardrail } from "./guardrails/index.js";
import { validateRequest } from "./validate.js";

/**
 * Calculate cost based on token usage and model pricing (embeddings only have input tokens)
 */
function calculateCost(modelRecord, inputTokens) {
  return (inputTokens / 1000) * (modelRecord.cost1kInput || 0);
}

/**
 * Track usage and update user's remaining balance
 */
async function trackUsage(userRecord, modelRecord, inputTokens, ip, guardrailCost = 0) {
  const cost = calculateCost(modelRecord, inputTokens) + guardrailCost;

  // User row — full cost (model + guardrail)
  await Usage.create({
    type: "user",
    userId: userRecord.id,
    modelId: modelRecord.id,
    inputTokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost,
    ip,
  });

  // Guardrail breakdown row (not additive — for visibility only)
  if (guardrailCost > 0) {
    await Usage.create({
      type: "guardrail",
      userId: userRecord.id,
      modelId: modelRecord.id,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cost: guardrailCost,
      ip,
    });
  }

  if (userRecord.budget !== null && userRecord.remaining !== null) {
    const newRemaining = Math.max(0, userRecord.remaining - cost);
    await userRecord.update({ remaining: newRemaining });
  }

  return cost;
}

const router = Router();
const provider = new BedrockProvider();
const guardrail = getGuardrail();

router.post("/embeddings", async (req, res) => {
  try {
    const records = await validateRequest(res, {
      body: req.body,
      requiredFields: ["model_id", "input", "user_id", "agent_id"],
    });
    if (!records) return;
    const { userRecord, modelRecord } = records;

    const { input, user_id, agent_id, model_id } = req.body;

    // Validate input type (endpoint-specific)
    if (typeof input !== "string" && !Array.isArray(input)) {
      return sendError(res, {
        errorType: ErrorType.INVALID_INPUT_FORMAT,
        message: "input must be a string or array of strings",
      });
    }

    logger.info(`Embedding request from user: ${user_id}, agent: ${agent_id}, model_id: ${model_id}`);

    // Apply guardrail to input text if configured
    let guardrailCost = 0;
    if (guardrail) {
      const textToCheck = Array.isArray(input) ? input.join(" ") : input;
      const result = await guardrail.check(textToCheck);
      guardrailCost = result.cost;

      if (result.blocked) {
        logger.warn(`Guardrail intervened on embedding input`);
        return sendError(res, {
          errorType: ErrorType.GUARDRAIL_BLOCKED,
          message: "Input blocked by guardrail policy",
          details: result.details,
        });
      }
    }

    // Use model internalName from database
    const result = await provider.embed(modelRecord.internalName, input);

    // Track usage and update remaining balance
    const ip = req.ip || req.socket?.remoteAddress || null;
    const inputTokens = result.inputTokenCount || 0;

    if (inputTokens > 0) {
      const cost = await trackUsage(userRecord, modelRecord, inputTokens, ip, guardrailCost);
      logger.info(`Usage tracked: user=${user_id}, model_id=${model_id}, input=${inputTokens}, guardrailCost=${guardrailCost.toFixed(6)}, cost=${cost.toFixed(6)}`);
    }

    const embeddings = Array.isArray(result.embedding[0])
      ? result.embedding.map((emb, i) => ({
          object: "embedding",
          index: i,
          embedding: emb,
        }))
      : [
          {
            object: "embedding",
            index: 0,
            embedding: result.embedding,
          },
        ];

    res.json({
      object: "list",
      model_id,
      data: embeddings,
      usage: {
        prompt_tokens: result.inputTokenCount || 0,
        total_tokens: result.inputTokenCount || 0,
      },
    });
  } catch (error) {
    logger.error(`Embedding error: ${error.message}`);

    const statusCode = error.$metadata?.httpStatusCode || 500;
    const errorType = getProviderErrorType(statusCode);

    sendError(res, {
      errorType,
      message: error.message,
      details: {
        provider_error: error.name || "api_error",
        code: error.code,
        model_id: req.body.model_id,
      },
      httpStatus: statusCode,
    });
  }
});

export default router;
