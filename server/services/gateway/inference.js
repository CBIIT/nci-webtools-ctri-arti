import { Model, Provider } from "../database.js";
import bedrock from "./providers/bedrock.js";
import gemini from "./providers/gemini.js";
import mock from "./providers/mock.js";

// AWS Guardrail configuration from environment variables
const {
  BEDROCK_GUARDRAIL_ID,
  BEDROCK_GUARDRAIL_VERSION = "DRAFT",
  BEDROCK_GUARDRAIL_TRACE = "disabled",
} = process.env;

export async function getModelProvider(internalName) {
  const providers = { bedrock, gemini, mock };
  const model = await Model.findOne({ where: { internalName }, include: Provider });
  const provider = new providers[model?.Provider?.name]();
  return { model, provider };
}

/**
 * Estimates the number of tokens in a content item
 * @param {Object} content - Content item from a message
 * @returns {number} Estimated token count
 */
function estimateContentTokens(content) {
  let tokens = 0;
  if (content.text) tokens += Math.ceil(content.text.length / 8);
  if (content.document?.source?.text) tokens += Math.ceil(content.document.source.text.length / 8);
  if (content.document?.source?.bytes)
    tokens += Math.ceil(content.document.source.bytes.length / 3);
  if (content.image?.source?.bytes) tokens += Math.ceil(content.image.source.bytes.length / 3);
  if (content.toolUse) tokens += Math.ceil(JSON.stringify(content.toolUse).length / 8);
  if (content.toolResult) tokens += Math.ceil(JSON.stringify(content.toolResult).length / 8);
  return tokens;
}

/**
 * Calculates optimal cache boundaries using √2 scaling factor
 * @param {number} maxTokens - Maximum token limit to consider
 * @returns {Array<number>} Array of token boundaries for cache points
 */
function calculateCacheBoundaries(maxTokens = 2000000) {
  const boundaries = [];
  const scalingFactor = Math.sqrt(2); // ~1.414
  let boundary = 1024;

  while (boundary <= maxTokens) {
    boundaries.push(Math.round(boundary));
    boundary *= scalingFactor;
  }

  return boundaries;
}

/**
 * Adds cache points to messages array at optimal positions
 * @param {Array} messages - Array of message objects
 * @param {boolean} hasCache - Whether the model supports caching
 * @returns {Array} Modified messages array with cache points
 */
function addCachePointsToMessages(messages, hasCache) {
  if (!hasCache || !messages?.length) return messages;

  const cachePoint = { cachePoint: { type: "default" } };
  const boundaries = calculateCacheBoundaries();
  const result = [];
  let totalTokens = 0;
  const cachePositions = [];

  // First pass: find where to place cache points
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const messageTokens = message.content.reduce((sum, c) => sum + estimateContentTokens(c), 0);
    const previousTotal = totalTokens;
    totalTokens += messageTokens;

    // Check if we crossed any boundary
    for (const boundary of boundaries) {
      if (previousTotal < boundary && totalTokens >= boundary) {
        cachePositions.push({
          index: i,
          boundary,
          tokensBeforeMessage: previousTotal,
        });
        break;
      }
    }
  }

  // Keep only the last 2 cache positions
  const selectedPositions = cachePositions.slice(-2);

  // Second pass: build result with cache points
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const shouldAddCache = selectedPositions.some((pos) => pos.index === i);

    if (shouldAddCache) {
      // Clone the message and add cache point to its content
      result.push({
        ...message,
        content: [...message.content, cachePoint],
      });
    } else {
      result.push(message);
    }
  }

  return result;
}

/**
 * Stream a conversation with an AI model by sending messages and receiving responses in a stream format.
 *
 * @param {string} modelId - The ID of the model to use (defaults to DEFAULT_MODEL_ID)
 * @param {Array|string} messages - Array of message objects or a string that will be converted to a user message
 * @param {string} systemPrompt - The system prompt to guide the model's behavior
 * @param {number} thoughtBudget - Token budget for the model's thinking process (0 disables thinking feature)
 * @param {Array} tools - Array of tools the model can use during the conversation
 * @returns {Promise<import("@aws-sdk/client-bedrock-runtime").ConverseStreamCommandOutput|import("@aws-sdk/client-bedrock-runtime").ConverseCommandOutput>} A promise that resolves to a stream of model responses
 */
export async function runModel({
  model,
  messages,
  system: systemPrompt,
  tools = [],
  thoughtBudget = 0,
  stream = false,
}) {
  if (!model || !messages || messages?.length === 0) {
    return null;
  }

  // process messages to ensure they are in the correct format
  messages = messages.filter(Boolean);
  for (const message of messages) {
    if (!message.content.filter(Boolean).length) {
      message.content.push({ text: "_" });
    }
    const contents = message.content.filter((c) => {
      if (thoughtBudget <= 0 && c.reasoningContent) {
        return false;
      }
      return !!c;
    });
    for (const content of contents) {
      if (!content) continue;
      // prevent empty text content
      if (content.text?.trim().length === 0) {
        content.text = "_";
      }
      // transform base64 encoded bytes to Uint8Array
      const source = content.document?.source || content.image?.source;
      if (source?.bytes && typeof source.bytes === "string") {
        source.bytes = Uint8Array.from(Buffer.from(source.bytes, "base64"));
      }
      // ensure tool call inputs are in the correct format
      if (content.toolUse) {
        const toolUseId = content.toolUse.toolUseId;
        if (typeof content.toolUse.input === "string") {
          content.toolUse.input = { text: content.toolUse.input };
        }
        // if tool results don't exist, interleave an empty result
        if (!messages.find((m) => m.content.find((c) => c.toolResult?.toolUseId === toolUseId))) {
          const toolResultsIndex = messages.indexOf(message) + 1;
          const content = [{ json: { results: {} } }];
          const toolResult = { toolUseId, content };
          const toolResultsMessage = { role: "user", content: [{ toolResult }] };
          messages.splice(toolResultsIndex, 0, toolResultsMessage);
        }
      }
    }
  }
  const {
    model: {
      maxOutput,
      maxReasoning,
      cost1kInput,
      _cost1kOutput,
      cost1kCacheRead,
      _cost1kCacheWrite,
    },
    provider,
  } = await getModelProvider(model);
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
  if (model.includes("sonnet-4")) {
    additionalModelRequestFields.anthropic_beta = ["context-1m-2025-08-07"];
  }
  // Build guardrail config if enabled (only for Bedrock models)
  const guardrailConfig =
    BEDROCK_GUARDRAIL_ID && model.includes("anthropic")
      ? {
          guardrailIdentifier: BEDROCK_GUARDRAIL_ID,
          guardrailVersion: BEDROCK_GUARDRAIL_VERSION,
          trace: BEDROCK_GUARDRAIL_TRACE,
          ...(stream && { streamProcessingMode: "sync" }),
        }
      : undefined;

  const input = {
    modelId: model,
    messages,
    system,
    toolConfig,
    inferenceConfig,
    additionalModelRequestFields,
    guardrailConfig,
  };
  const response = stream ? provider.converseStream(input) : provider.converse(input);
  const result = await response;

  // Debug logging for cache behavior
  if (hasCache && !stream && result.usage) {
    const totalEstimatedTokens = messages.reduce(
      (sum, m) => sum + m.content.reduce((s, c) => s + estimateContentTokens(c), 0),
      0
    );
    const messagesWithCache = messages.filter((m) => m.content.some((c) => c.cachePoint)).length;
    const cacheRead = result.usage.cacheReadInputTokens || 0;
    const cacheWrite = result.usage.cacheWriteInputTokens || 0;

    // Calculate cost savings using actual model costs
    const totalInputTokens = result.usage.inputTokens + cacheRead;
    const regularCost = (totalInputTokens * cost1kInput) / 1000; // Cost without cache
    const actualCost =
      (result.usage.inputTokens * cost1kInput + cacheRead * cost1kCacheRead) / 1000; // Cost with cache
    const savings = regularCost - actualCost;

    console.log("[Cache Debug]", {
      model,
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

// Export helper functions for testing
export { estimateContentTokens, calculateCacheBoundaries, addCachePointsToMessages };
