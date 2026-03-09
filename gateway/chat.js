import db, { Model } from "database";

import { eq } from "drizzle-orm";

import { processMessages } from "./preprocess.js";
import { addCachePointsToMessages, estimateContentTokens } from "./prompt-cache.js";
import bedrock from "./providers/bedrock.js";
import gemini from "./providers/gemini.js";
import mock from "./providers/mock.js";

const providers = { bedrock, gemini, mock };

/**
 * Resolve the provider instance for a given model record.
 * @param {Object} model - Full model record (must have id)
 * @returns {{ model: Object, provider: Object }}
 */
export async function getModelProvider(model) {
  const result = await db.query.Model.findFirst({
    where: eq(Model.id, model.id),
    with: { Provider: true },
  });
  const provider = new providers[result?.Provider?.name]();
  return { model: result, provider };
}

/**
 * Assemble the full inference input object from a model record.
 * @param {Object} model - Full model record from DB
 */
async function buildInferenceParams(
  model,
  messages,
  systemPrompt,
  tools,
  thoughtBudget,
  outputConfig
) {
  const { model: modelWithProvider, provider } = await getModelProvider(model);
  const { maxOutput, maxReasoning, cost1kInput, cost1kCacheRead } = modelWithProvider;
  const hasCache = !!cost1kCacheRead;
  const maxTokens = Math.min(maxOutput, thoughtBudget + 2000);

  // Add cache points to messages
  messages = addCachePointsToMessages(messages, hasCache);

  // Cache point for system and tools
  const cachePoint = hasCache ? { cachePoint: { type: "default" } } : undefined;
  const system = systemPrompt ? [{ text: systemPrompt }, cachePoint].filter(Boolean) : undefined;
  const toolConfig =
    tools.length > 0 ? { tools: [...tools, cachePoint].filter(Boolean) } : undefined;
  const inferenceConfig = thoughtBudget > 0 ? { maxTokens } : undefined;
  const additionalModelRequestFields = {};
  if (thoughtBudget > 0 && maxReasoning > 0) {
    additionalModelRequestFields.thinking = { type: "enabled", budget_tokens: +thoughtBudget };
  }
  if (modelWithProvider.internalName?.includes("sonnet-4")) {
    additionalModelRequestFields.anthropic_beta = ["context-1m-2025-08-07"];
  }

  const input = {
    modelId: modelWithProvider.internalName,
    messages,
    system,
    toolConfig,
    inferenceConfig,
    additionalModelRequestFields,
    ...(outputConfig && { outputConfig }),
  };

  return { input, provider, hasCache, cost1kInput, cost1kCacheRead };
}

/**
 * Run inference on a chat model.
 *
 * @param {Object} params
 * @param {Object} params.model - Full model record from DB
 * @param {Array} params.messages - Array of message objects
 * @param {string} params.system - System prompt
 * @param {number} params.thoughtBudget - Token budget for thinking (0 disables)
 * @param {Array} params.tools - Tools the model can use
 * @param {boolean} params.stream - Whether to stream the response
 * @param {Object} params.outputConfig - Optional output configuration
 * @returns {Promise<Object>} Inference result or stream
 */
export async function runModel({
  model,
  messages,
  system: systemPrompt,
  tools = [],
  thoughtBudget = 0,
  stream = false,
  outputConfig,
}) {
  if (!model || !messages || messages?.length === 0) {
    return null;
  }

  messages = processMessages(messages, thoughtBudget);

  const { input, provider, hasCache, cost1kInput, cost1kCacheRead } = await buildInferenceParams(
    model,
    messages,
    systemPrompt,
    tools,
    thoughtBudget,
    outputConfig
  );

  const response = stream ? provider.converseStream(input) : provider.converse(input);
  const result = await response;

  // Debug logging for cache behavior
  if (hasCache && !stream && result.usage) {
    const totalEstimatedTokens = input.messages.reduce(
      (sum, m) => sum + m.content.reduce((s, c) => s + estimateContentTokens(c), 0),
      0
    );
    const messagesWithCache = input.messages.filter((m) =>
      m.content.some((c) => c.cachePoint)
    ).length;
    const cacheRead = result.usage.cacheReadInputTokens || 0;
    const cacheWrite = result.usage.cacheWriteInputTokens || 0;

    const totalInputTokens = result.usage.inputTokens + cacheRead;
    const regularCost = (totalInputTokens * cost1kInput) / 1000;
    const actualCost =
      (result.usage.inputTokens * cost1kInput + cacheRead * cost1kCacheRead) / 1000;
    const savings = regularCost - actualCost;

    console.log("[Cache Debug]", {
      model: model.internalName,
      estimatedTotalTokens: totalEstimatedTokens,
      actualInputTokens: result.usage.inputTokens,
      messagesWithCachePoints: messagesWithCache,
      cache: {
        read: cacheRead,
        write: cacheWrite,
        hitRate:
          totalInputTokens > 0 ? `${((cacheRead / totalInputTokens) * 100).toFixed(1)}%` : "0%",
      },
      cost: {
        withoutCache: `$${regularCost.toFixed(6)}`,
        withCache: `$${actualCost.toFixed(6)}`,
        savings: `$${savings.toFixed(6)}`,
        percentSaved: regularCost > 0 ? `${((savings / regularCost) * 100).toFixed(1)}%` : "0%",
      },
    });
  }

  return result;
}
