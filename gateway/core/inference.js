import db, { Model } from "database";

import { eq } from "drizzle-orm";
import { assertValidEmbedding } from "shared/embeddings.js";
import {
  estimateContentTokens,
  estimateConverseTokens,
  estimateMessageTokens,
} from "shared/token-estimation.js";

import bedrock from "../providers/bedrock.js";
import databricks from "../providers/databricks.js";
import gemini from "../providers/gemini.js";
import scripted from "../providers/scripted.js";

import { validateInlineMessages } from "./upload-limits.js";

export async function getModelProvider(value) {
  const providers = { bedrock, databricks, gemini, scripted };
  const result = await db.query.Model.findFirst({
    where: eq(Model.internalName, value),
    with: { Provider: true },
  });
  const providerName = result?.Provider?.name;
  const ProviderClass = providers[providerName];
  const provider = ProviderClass ? new ProviderClass(result.Provider) : null;
  return { model: result, provider };
}

function sanitizeProviderFileName(name = "") {
  const sanitized = Array.from(String(name), (char) => {
    if (char === "_") return "-";
    if (/[A-Z0-9]/i.test(char) || /\s/.test(char) || "-()[]".includes(char)) return char;
    return " ";
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "uploaded file";
}

function getProviderVisibleFileName(file = {}) {
  const originalName = String(file.originalName || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.trim();
  const fallbackName = String(file.name || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.trim();
  const candidate = originalName || fallbackName || "";
  const stem = candidate.replace(/\.[^.]+$/, "") || candidate;
  return sanitizeProviderFileName(stem);
}

/**
 * Calculates optimal cache boundaries using sqrt(2) scaling factor
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
 * @param {Object} options - Additional converse input context
 * @returns {Array} Modified messages array with cache points
 */
function addCachePointsToMessages(
  messages,
  hasCache,
  { system = [], toolConfig, additionalModelRequestFields } = {}
) {
  if (!hasCache || !messages?.length) return messages;

  const cachePoint = { cachePoint: { type: "default" } };
  const boundaries = calculateCacheBoundaries();
  const result = [];
  let totalTokens = estimateConverseTokens({ system, toolConfig, additionalModelRequestFields });
  const cachePositions = [];

  // First pass: find where to place cache points
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const messageTokens = estimateMessageTokens([message]);
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

function normalizeMessageContent(content, thoughtBudget) {
  if (thoughtBudget <= 0 && content.reasoningContent) {
    return null;
  }
  if (content.text?.trim().length === 0) {
    content.text = "_";
  }

  const source = content.document?.source || content.image?.source;
  if (source?.bytes) {
    if (typeof source.bytes === "string") {
      source.bytes = Uint8Array.from(Buffer.from(source.bytes, "base64"));
    } else if (source.bytes?.type === "Buffer" && Array.isArray(source.bytes.data)) {
      source.bytes = new Uint8Array(source.bytes.data);
    }
  }

  if (content.document) {
    content.document.name = getProviderVisibleFileName(content.document);
  }
  if (content.image) {
    content.image.name = getProviderVisibleFileName(content.image);
  }
  if (content.toolUse && typeof content.toolUse.input === "string") {
    content.toolUse.input = { text: content.toolUse.input };
  }

  return content;
}

function interleaveMissingToolResults(messages) {
  for (const message of messages) {
    for (const content of message.content) {
      if (!content.toolUse) continue;

      const toolUseId = content.toolUse.toolUseId;
      const hasToolResult = messages.some((candidate) =>
        candidate.content.some((block) => block.toolResult?.toolUseId === toolUseId)
      );
      if (hasToolResult) continue;

      const toolResultsIndex = messages.indexOf(message) + 1;
      const toolResultsMessage = {
        role: "user",
        content: [{ toolResult: { toolUseId, content: [{ json: { results: {} } }] } }],
      };
      messages.splice(toolResultsIndex, 0, toolResultsMessage);
    }
  }

  return messages;
}

/**
 * Validate and normalize messages: filter nulls, ensure non-empty content,
 * strip reasoning when disabled, convert base64 bytes, and interleave missing
 * tool results without rewriting message roles.
 */
function processMessages(messages, thoughtBudget) {
  const normalizedMessages = messages.filter(Boolean).map((message) => {
    const content = (message.content || [])
      .filter(Boolean)
      .map((block) => normalizeMessageContent(block, thoughtBudget))
      .filter(Boolean);

    return {
      ...message,
      content: content.length > 0 ? content : [{ text: "_" }],
    };
  });

  return interleaveMissingToolResults(normalizedMessages);
}

/**
 * Look up the provider and assemble the full inference input object
 * (model config, cache points, system prompt, tool config, thinking config).
 */
async function buildInferenceParams(
  modelId,
  messages,
  systemPrompt,
  tools,
  thoughtBudget,
  outputConfig,
  guardrailConfig,
  { includeCachePoints = true } = {}
) {
  const {
    model: { maxOutput, maxReasoning, cost1kCacheRead },
    provider,
  } = await getModelProvider(modelId);
  const hasCache = !!cost1kCacheRead;
  const maxTokens = Math.min(maxOutput, thoughtBudget + 2000);

  const rawSystem = systemPrompt ? [{ text: systemPrompt }] : undefined;
  const rawToolConfig = tools.length > 0 ? { tools: [...tools] } : undefined;
  const additionalModelRequestFields = {};
  if (thoughtBudget > 0 && maxReasoning > 0) {
    additionalModelRequestFields.thinking = { type: "enabled", budget_tokens: +thoughtBudget };
  }
  if (modelId.includes("sonnet-4")) {
    additionalModelRequestFields.anthropic_beta = ["context-1m-2025-08-07"];
  }

  if (includeCachePoints) {
    messages = addCachePointsToMessages(messages, hasCache, {
      system: rawSystem,
      toolConfig: rawToolConfig,
      additionalModelRequestFields,
    });
  }

  const cachePoint =
    includeCachePoints && hasCache ? { cachePoint: { type: "default" } } : undefined;
  const system = rawSystem ? [...rawSystem, cachePoint].filter(Boolean) : undefined;
  const toolConfig = rawToolConfig
    ? { tools: [...rawToolConfig.tools, cachePoint].filter(Boolean) }
    : undefined;
  const inferenceConfig = thoughtBudget > 0 ? { maxTokens } : undefined;

  const input = {
    modelId,
    messages,
    system,
    toolConfig,
    inferenceConfig,
    additionalModelRequestFields,
    ...(outputConfig && { outputConfig }),
    ...(guardrailConfig && {
      guardrailConfig: {
        ...guardrailConfig,
        trace: guardrailConfig.trace || "enabled",
      },
    }),
  };

  return { input, provider };
}

/**
 * Stream a conversation with an AI model by sending messages and receiving responses.
 *
 * @param {string} model - The model internal name
 * @param {Array} messages - Array of message objects
 * @param {string} system - System prompt
 * @param {number} thoughtBudget - Token budget for thinking (0 disables)
 * @param {Array} tools - Tools the model can use
 * @param {boolean} stream - Whether to stream the response
 * @param {Object} outputConfig - Optional output configuration
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
  guardrailConfig,
}) {
  if (!model || !messages || messages?.length === 0) {
    return null;
  }

  messages = processMessages(messages, thoughtBudget);
  await validateInlineMessages(messages);

  const { input, provider } = await buildInferenceParams(
    model,
    messages,
    systemPrompt,
    tools,
    thoughtBudget,
    outputConfig,
    guardrailConfig
  );

  const response = stream ? provider.converseStream(input) : provider.converse(input);
  const result = await response;
  return stream ? { stream: result.stream } : result;
}

export { sanitizeProviderFileName, getProviderVisibleFileName, processMessages };

/**
 * Run embedding inference on an array of content items.
 *
 * @param {Object} params
 * @param {string} params.model - The embedding model internal name
 * @param {Array} params.content - Array of content items (strings for text, objects for images/video/audio)
 * @param {string} params.purpose - "GENERIC_INDEX" or "GENERIC_RETRIEVAL"
 * @returns {Promise<{embeddings: number[][], usage: Object}>}
 */
export async function runEmbedding({ model, content, purpose = "GENERIC_INDEX" }) {
  if (!model || !content?.length) return { embeddings: [], usage: {} };

  const { model: modelRecord, provider } = await getModelProvider(model);
  const modelId = modelRecord.internalName;

  const embeddings = [];
  let totalInputTokens = 0;
  let imageCount = 0;

  // Process items with concurrency limit
  const CONCURRENCY = 5;
  for (let i = 0; i < content.length; i += CONCURRENCY) {
    const batch = content.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((item) => provider.embed(modelId, item, { purpose }))
    );
    for (const result of results) {
      embeddings.push(
        assertValidEmbedding(result?.embedding, {
          message: `Model ${modelId} returned an invalid embedding`,
        })
      );
      if (result.inputTextTokenCount) totalInputTokens += result.inputTextTokenCount;
      if (typeof content[embeddings.length - 1] !== "string") imageCount++;
    }
  }

  return {
    embeddings,
    usage: {
      inputTextTokenCount: totalInputTokens || undefined,
      imageCount: imageCount || undefined,
    },
  };
}

// Export helper functions for testing
export { estimateContentTokens, calculateCacheBoundaries, addCachePointsToMessages };
