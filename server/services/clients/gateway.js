/**
 * Gateway Client
 *
 * Provides inference via direct function calls (monolith mode).
 * The /v1/chat and /v1/embeddings endpoints now handle most inference.
 * This client is still used by routes/model.js for legacy POST /api/model calls
 * (e.g. browse tool summarization).
 */

import { Model, Provider, Usage, User } from "../database.js";
import { runModel as directRunModel } from "../gateway/chat.js";
import { getGuardrail } from "../gateway/guardrails/index.js";
import logger from "../logger.js";

const guardrail = getGuardrail();

function calculateCost(modelRecord, inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) {
  const inputCost = (inputTokens / 1000) * (modelRecord.cost1kInput || 0);
  const outputCost = (outputTokens / 1000) * (modelRecord.cost1kOutput || 0);
  const cacheReadCost = (cacheReadTokens / 1000) * (modelRecord.cost1kCacheRead || 0);
  const cacheWriteCost = (cacheWriteTokens / 1000) * (modelRecord.cost1kCacheWrite || 0);
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

async function trackUsage(userRecord, modelRecord, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, guardrailCost = 0) {
  const modelCost = calculateCost(modelRecord, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
  const cost = modelCost + guardrailCost;

  // User row — full cost (model + guardrail)
  await Usage.create({
    type: "user",
    userId: userRecord.id,
    modelId: modelRecord.id,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cost,
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
    });
  }

  if (userRecord.budget !== null && userRecord.remaining !== null) {
    const newRemaining = Math.max(0, userRecord.remaining - cost);
    await userRecord.update({ remaining: newRemaining });
  }

  return cost;
}

/**
 * Run AI inference (monolith mode only — legacy callers)
 * @param {Object} options - Inference options
 * @param {string} options.userId - User ID for rate limiting
 * @param {string} options.model - Model internal name
 * @param {Array} options.messages - Messages array
 * @param {string} options.system - System prompt
 * @param {Array} options.tools - Tools array
 * @param {number} options.thoughtBudget - Token budget for thinking
 * @param {boolean} options.stream - Whether to stream the response
 * @returns {Promise<Object>} - Inference result or stream
 */
export async function infer({ userId, model, messages, system, tools, thoughtBudget, stream }) {
  // Load user and model records for budget check and usage tracking
  const userRecord = userId ? await User.findByPk(userId) : null;
  const modelRecord = model
    ? await Model.findOne({ where: { internalName: model }, include: [Provider] })
    : null;

  // Budget check
  if (userRecord?.budget !== null && userRecord?.remaining !== null && userRecord?.remaining <= 0) {
    return {
      error:
        "You have reached your daily usage limit. Your access to the chat tool is temporarily disabled and will reset at midnight. If you need assistance or believe this is an error, please contact the Research Optimizer helpdesk at CTRIBResearchOptimizer@mail.nih.gov.",
      status: 429,
    };
  }

  const result = await directRunModel({ model, messages, system, tools, thoughtBudget, stream });

  // Track usage for non-streaming responses
  if (!stream && result && !result.error && userRecord && modelRecord) {
    const usage = result.usage || {};
    const inputTokens = usage.inputTokens || 0;
    const outputTokens = usage.outputTokens || 0;
    const cacheReadTokens = usage.cacheReadInputTokens || 0;
    const cacheWriteTokens = usage.cacheWriteInputTokens || 0;

    // Extract inline guardrail cost from response metadata
    const guardrailCost = guardrail?.supportsInline
      ? guardrail.calculateCostFromResponse({ usage: result.usage, trace: result.trace })
      : 0;

    if (inputTokens > 0 || outputTokens > 0) {
      const cost = await trackUsage(userRecord, modelRecord, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, guardrailCost);
      logger.info(
        `Legacy usage tracked: user=${userId}, model=${model}, input=${inputTokens}, output=${outputTokens}, guardrail=${guardrailCost.toFixed(6)}, cost=${cost.toFixed(6)}`
      );
    }
  }

  // For streaming responses, wrap the stream to track usage from metadata
  if (stream && result?.stream && userRecord && modelRecord) {
    const originalStream = result.stream;
    result.stream = (async function* () {
      for await (const event of originalStream) {
        yield event;

        if (event.metadata?.usage) {
          const usage = event.metadata.usage;
          const inputTokens = usage.inputTokens || 0;
          const outputTokens = usage.outputTokens || 0;
          const cacheReadTokens = usage.cacheReadInputTokens || 0;
          const cacheWriteTokens = usage.cacheWriteInputTokens || 0;

          // Extract inline guardrail cost from stream metadata
          const guardrailCost = guardrail?.supportsInline
            ? guardrail.calculateCostFromResponse(event.metadata)
            : 0;

          if (inputTokens > 0 || outputTokens > 0) {
            const cost = await trackUsage(userRecord, modelRecord, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, guardrailCost);
            logger.info(
              `Legacy stream usage tracked: user=${userId}, model=${model}, input=${inputTokens}, output=${outputTokens}, guardrail=${guardrailCost.toFixed(6)}, cost=${cost.toFixed(6)}`
            );
          }
        }
      }
    })();
  }

  return result;
}

/**
 * List available models
 * @returns {Promise<Array>} - Array of model objects
 */
export async function listModels() {
  return Model.findAll({
    attributes: ["name", "internalName", "maxContext", "maxOutput", "maxReasoning"],
    where: { providerId: 1 },
  });
}
