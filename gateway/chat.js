import { processMessages } from "./preprocess.js";
import { addCachePointsToMessages } from "./prompt-cache.js";
import bedrock from "./providers/bedrock.js";
import gemini from "./providers/gemini.js";
import mock from "./providers/mock.js";

const providers = { bedrock, gemini, mock };

/**
 * Resolve the provider instance for a given model record.
 * @param {Object} model - Model record with Provider relation included
 * @returns {Object} Provider instance
 */
export function getModelProvider(model) {
  return new providers[model.Provider?.name]();
}

/**
 * Assemble the full inference input object from a model record.
 * @param {Object} model - Full model record from DB
 */
function buildInferenceParams(model, messages, systemPrompt, tools, thoughtBudget, outputConfig) {
  const provider = getModelProvider(model);
  const { maxOutput, maxReasoning, cost1kCacheRead } = model;
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
  if (model.internalName?.includes("sonnet-4")) {
    additionalModelRequestFields.anthropic_beta = ["context-1m-2025-08-07"];
  }

  const input = {
    modelId: model.internalName,
    messages,
    system,
    toolConfig,
    inferenceConfig,
    additionalModelRequestFields,
    ...(outputConfig && { outputConfig }),
  };

  return { input, provider };
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

  const { input, provider } = buildInferenceParams(
    model,
    messages,
    systemPrompt,
    tools,
    thoughtBudget,
    outputConfig
  );

  return stream ? provider.converseStream(input) : provider.converse(input);
}
