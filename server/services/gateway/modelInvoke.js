import { Router } from "express";
import BedrockProvider from "./providers/bedrock.js";
import gemini from "./providers/gemini.js";
import mock from "./providers/mock.js";
import logger from "../logger.js";
import { Model, Provider, Prompt, Usage } from "../database.js";
import { ErrorType, sendError, getProviderErrorType } from "./errors.js";
import { getGuardrail } from "./guardrails/index.js";
import { validateRequest } from "./validate.js";

const guardrail = getGuardrail();

const providerMap = { bedrock: BedrockProvider, gemini, mock };

export async function getModelProvider(internalName) {
  const model = await Model.findOne({ where: { internalName }, include: Provider });
  const provider = new providerMap[model?.Provider?.name]();
  return { model, provider };
}

/**
 * Run AI inference with message preprocessing, caching, and provider call.
 * Supports both streaming (converseStream) and non-streaming (converse).
 *
 * @param {string} model - Model internal name
 * @param {Array} messages - Array of message objects
 * @param {string} [system] - System prompt
 * @param {Array} [tools] - Tools array
 * @param {number} [thoughtBudget=0] - Token budget for thinking (0 disables)
 * @param {boolean} [stream=false] - Whether to stream the response
 * @returns {Promise<Object>} Provider response
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

  // Preprocess messages to ensure they are in the correct format
  messages = messages.filter(Boolean);
  for (const message of messages) {
    if (!message.content.filter(Boolean).length) {
      message.content.push({ text: "_" });
    }
    message.content = message.content.filter((c) => {
      if (thoughtBudget <= 0 && c.reasoningContent) return false;
      return !!c;
    });
    for (const content of message.content) {
      if (!content) continue;
      if (content.text?.trim().length === 0) {
        content.text = "_";
      }
      const source = content.document?.source || content.image?.source;
      if (source?.bytes && typeof source.bytes === "string") {
        source.bytes = Uint8Array.from(Buffer.from(source.bytes, "base64"));
      }
      if (content.toolUse) {
        const toolUseId = content.toolUse.toolUseId;
        if (typeof content.toolUse.input === "string") {
          content.toolUse.input = { text: content.toolUse.input };
        }
        if (!messages.find((m) => m.content.find((c) => c.toolResult?.toolUseId === toolUseId))) {
          const toolResultsIndex = messages.indexOf(message) + 1;
          const resultContent = [{ json: { results: {} } }];
          const toolResult = { toolUseId, content: resultContent };
          messages.splice(toolResultsIndex, 0, { role: "user", content: [{ toolResult }] });
        }
      }
    }
  }

  const {
    model: { maxOutput, maxReasoning, cost1kInput, cost1kCacheRead, cost1kCacheWrite },
    provider,
  } = await getModelProvider(model);
  const hasCache = !!(cost1kCacheRead || cost1kCacheWrite);
  const maxTokens = Math.min(maxOutput, thoughtBudget + 2000);

  // Add cache points to messages
  messages = addCachePointsToMessages(messages, hasCache, model);

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

  // Build guardrail config if the guardrail supports inline mode
  const guardrailConfig = guardrail?.getInlineConfig({ stream });

  const input = {
    modelId: model,
    messages,
    system,
    toolConfig,
    inferenceConfig,
    additionalModelRequestFields,
    guardrailConfig,
  };

  return stream ? provider.converseStream(input) : provider.converse(input);
}

// --- Cache utilities ---

/**
 * Estimates the number of tokens in a content item
 */
function estimateContentTokens(content) {
  let tokens = 0;
  if (content.text) tokens += Math.ceil(content.text.length / 8);
  if (content.document?.source?.text) tokens += Math.ceil(content.document.source.text.length / 8);
  if (content.document?.source?.bytes)
    tokens += Math.ceil(content.document.source.bytes.length / 3);
  if (content.image?.source?.bytes) tokens += Math.ceil(content.image.source.bytes.length / 750);
  return tokens;
}

/**
 * Get minimum token threshold for caching based on model
 */
function getCacheMinTokens(modelName) {
  if (modelName.includes("opus-4-5")) return 4096;
  if (modelName.includes("haiku")) return 2048;
  return 1024;
}

/**
 * Calculate boundaries for placing cache points using sqrt(2) scaling
 */
function calculateCacheBoundaries(minTokens = 1024, maxTokens = 2000000) {
  const boundaries = [];
  const scalingFactor = Math.sqrt(2);
  let boundary = minTokens;

  while (boundary <= maxTokens) {
    boundaries.push(Math.round(boundary));
    boundary *= scalingFactor;
  }

  return boundaries;
}

/**
 * Adds cache points to messages array at optimal positions
 */
function addCachePointsToMessages(messages, hasCache, modelName) {
  if (!hasCache || !messages?.length) return messages;

  const cachePoint = { cachePoint: { type: "default" } };
  const minTokens = getCacheMinTokens(modelName);
  const boundaries = calculateCacheBoundaries(minTokens);
  const result = [];
  let totalTokens = 0;
  const cachePositions = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const messageTokens = message.content.reduce((sum, c) => sum + estimateContentTokens(c), 0);
    const previousTotal = totalTokens;
    totalTokens += messageTokens;

    for (const boundary of boundaries) {
      if (previousTotal < boundary && totalTokens >= boundary) {
        cachePositions.push({ index: i, boundary, tokensBeforeMessage: previousTotal });
        break;
      }
    }
  }

  const selectedPositions = cachePositions.slice(-2);

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (selectedPositions.some((pos) => pos.index === i)) {
      result.push({ ...message, content: [...message.content, cachePoint] });
    } else {
      result.push(message);
    }
  }

  return result;
}

// --- Cost and usage tracking (chat) ---

function calculateChatCost(
  modelRecord,
  inputTokens,
  outputTokens,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
) {
  const inputCost = (inputTokens / 1000) * (modelRecord.cost1kInput || 0);
  const outputCost = (outputTokens / 1000) * (modelRecord.cost1kOutput || 0);
  const cacheReadCost = (cacheReadTokens / 1000) * (modelRecord.cost1kCacheRead || 0);
  const cacheWriteCost = (cacheWriteTokens / 1000) * (modelRecord.cost1kCacheWrite || 0);
  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

async function trackChatUsage(
  userRecord,
  agentId,
  modelRecord,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  guardrailCost = 0
) {
  const modelCost = calculateChatCost(
    modelRecord,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens
  );
  const cost = modelCost + guardrailCost;

  // User row — full cost (model + guardrail)
  await Usage.create({
    type: "user",
    userId: userRecord.id,
    agentId,
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
      agentId,
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

// --- Cost and usage tracking (embeddings) ---

function calculateEmbeddingCost(modelRecord, inputTokens) {
  return (inputTokens / 1000) * (modelRecord.cost1kInput || 0);
}

async function trackEmbeddingUsage(userRecord, modelRecord, inputTokens, ip, guardrailCost = 0) {
  const cost = calculateEmbeddingCost(modelRecord, inputTokens) + guardrailCost;

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

// --- Chat route helpers ---

/**
 * Load the system prompt for an agent, replacing {{time}} placeholder.
 * Uses ARTI schema: Agent.belongsTo(Prompt, { foreignKey: "promptId" })
 */
async function loadSystemPrompt(agentRecord) {
  if (!agentRecord.promptId) return null;
  const promptRecord = await Prompt.findByPk(agentRecord.promptId);
  if (!promptRecord?.content) return null;
  return promptRecord.content.replace(
    /\{\{time\}\}/g,
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  );
}

/**
 * Build the provider input for a chat request.
 * Merges parameters with priority: user > agent > model defaults.
 */
function buildChatInput(modelRecord, messages, systemPrompt, defaultParameters, agentRecord, stream = false, tool) {
  const userParams = defaultParameters || {};
  const agentParams = agentRecord.modelParameters || {};
  const modelDefaults = modelRecord.defaultParameters || {};

  // Merge parameters with priority: user > agent > model
  const finalMaxTokens = userParams.maxTokens ?? agentParams.maxTokens ?? modelRecord.maxOutput;
  const finalTemperature =
    userParams.temperature ?? agentParams.temperature ?? modelDefaults.temperature;
  const finalTopP = userParams.topP ?? agentParams.topP ?? modelDefaults.topP;
  const finalTopK = userParams.topK ?? agentParams.topK ?? modelDefaults.topK;
  const finalStopSequences = userParams.stopSequences ?? agentParams.stopSequences;

  // Anthropic models reject requests with both temperature and topP — temperature takes priority
  const inferenceConfig = {
    maxTokens: finalMaxTokens,
    ...(finalTemperature !== undefined
      ? { temperature: finalTemperature }
      : finalTopP !== undefined
        ? { topP: finalTopP }
        : {}),
    ...(finalTopK !== undefined && { topK: finalTopK }),
    ...(finalStopSequences && {
      stopSequences: Array.isArray(finalStopSequences) ? finalStopSequences : [finalStopSequences],
    }),
  };

  // Cache points
  const hasCache = !!(modelRecord.cost1kCacheRead || modelRecord.cost1kCacheWrite);
  const messagesWithCache = addCachePointsToMessages(messages, hasCache, modelRecord.internalName);

  // Additional model request fields (thinking / extended context)
  const thoughtBudget = userParams.thoughtBudget || 0;
  const additionalModelRequestFields = {};
  if (thoughtBudget > 0 && modelRecord.maxReasoning > 0) {
    additionalModelRequestFields.thinking = { type: "enabled", budget_tokens: +thoughtBudget };
  }
  if (modelRecord.internalName.includes("sonnet-4")) {
    additionalModelRequestFields.anthropic_beta = ["context-1m-2025-08-07"];
  }

  // Override maxTokens when thinking is enabled
  if (thoughtBudget > 0) {
    inferenceConfig.maxTokens = Math.min(modelRecord.maxOutput, thoughtBudget + 2000);
  }

  return {
    modelId: modelRecord.internalName,
    messages: messagesWithCache,
    ...(systemPrompt && { system: [{ text: systemPrompt }] }),
    inferenceConfig,
    additionalModelRequestFields,
    ...(tool && { toolConfig: { tools: tool } }),
    ...(guardrail?.supportsInline && { guardrailConfig: guardrail.getInlineConfig({ stream }) }),
  };
}

// --- Unified route ---

const router = Router();

router.post("/modelInvoke", async (req, res) => {
  try {
    const { action } = req.body;

    // Validate common fields and action
    const requiredFields = ["model_id", "user_id", "agent_id", "action", "messages"];
    const modelInclude = [Provider];

    const records = await validateRequest(res, {
      body: req.body,
      requiredFields,
      validActions: ["chat", "embedding"],
      modelInclude,
    });
    if (!records) return;
    const { userRecord, agentRecord, modelRecord } = records;

    if (action === "chat") {
      await handleChat(req, res, userRecord, agentRecord, modelRecord);
    } else {
      await handleEmbedding(req, res, userRecord, modelRecord);
    }
  } catch (error) {
    const action = req.body.action || "model";
    logger.error(`${action} error: ${error.message}`);

    const statusCode = error.$metadata?.httpStatusCode || 500;
    const errorType = getProviderErrorType(statusCode);

    if (!res.headersSent) {
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
  }
});

// --- Chat handler ---

async function handleChat(req, res, userRecord, agentRecord, modelRecord) {
  const { messages, defaultParameters, user_id, agent_id, model_id, stream = false, tool } = req.body;

  // Load system prompt and build provider input
  const systemPrompt = await loadSystemPrompt(agentRecord);
  const input = buildChatInput(modelRecord, messages, systemPrompt, defaultParameters, agentRecord, stream, tool);

  const hasCache = !!(modelRecord.cost1kCacheRead || modelRecord.cost1kCacheWrite);
  logger.info(
    `Chat request from user: ${user_id}, agent: ${agent_id}, model_id: ${model_id}, caching: ${hasCache}`
  );

  // Standalone guardrail pre-check for non-inline guardrails (e.g. LLM screening)
  let standaloneGuardrailCost = 0;
  if (guardrail && !guardrail.supportsInline) {
    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    const textToCheck = lastUserMessage?.content
      ?.map((c) => c.text)
      .filter(Boolean)
      .join(" ");
    if (textToCheck) {
      const result = await guardrail.check(textToCheck);
      standaloneGuardrailCost = result.cost;
      if (result.blocked) {
        return sendError(res, {
          errorType: ErrorType.GUARDRAIL_BLOCKED,
          message: "Input blocked by guardrail policy",
          details: result.details,
        });
      }
    }
  }

  const provider = new providerMap[modelRecord.Provider.name]();

  if (stream) {
    // Streaming response as NDJSON with cancellation support
    const response = await provider.converseStream(input);

    let aborted = false;
    let metadataReceived = false;

    req.on("close", () => {
      if (!res.writableEnded) {
        aborted = true;
        response.stream?.destroy?.();
      }
    });

    // Track reasoning block indices so we can filter them from the stream
    const reasoningBlocks = new Set();

    try {
      for await (const event of response.stream) {
        if (aborted) break;

        // Skip reasoning/thinking content blocks
        if (event.contentBlockStart?.start?.reasoningContent !== undefined) {
          reasoningBlocks.add(event.contentBlockStart.contentBlockIndex);
          continue;
        }
        const blockIdx =
          event.contentBlockDelta?.contentBlockIndex ??
          event.contentBlockStop?.contentBlockIndex;
        if (blockIdx !== undefined && reasoningBlocks.has(blockIdx)) {
          continue;
        }

        res.write(JSON.stringify(event) + "\n");

        // Track usage from the metadata event at the end of the stream
        if (event.metadata?.usage) {
          metadataReceived = true;
          const usage = event.metadata.usage;
          const inputTokens = usage.inputTokens || 0;
          const outputTokens = usage.outputTokens || 0;
          const cacheReadTokens = usage.cacheReadInputTokens || 0;
          const cacheWriteTokens = usage.cacheWriteInputTokens || 0;
          const inlineCost = guardrail?.supportsInline
            ? guardrail.calculateCostFromResponse(event.metadata)
            : 0;
          const guardrailCost = inlineCost + standaloneGuardrailCost;

          if (inputTokens > 0 || outputTokens > 0) {
            const cost = await trackChatUsage(
              userRecord,
              agent_id,
              modelRecord,
              inputTokens,
              outputTokens,
              cacheReadTokens,
              cacheWriteTokens,
              guardrailCost
            );
            logger.info(
              `Usage tracked: user=${user_id}, agent=${agent_id}, model_id=${model_id}, input=${inputTokens}, output=${outputTokens}, cacheRead=${cacheReadTokens}, cacheWrite=${cacheWriteTokens}, guardrailCost=${guardrailCost.toFixed(6)}, cost=${cost.toFixed(6)}`
            );
          }
        }
      }
    } catch (err) {
      if (!aborted) throw err;
    }

    if (aborted) {
      logger.info(
        `Chat stream aborted: user=${user_id}, agent=${agent_id}, model_id=${model_id}, metadataReceived=${metadataReceived}`
      );
      return;
    }

    res.end();
  } else {
    // Non-streaming single JSON response
    const response = await provider.converse(input);
    const { output, usage, stopReason, metrics, trace } = response;

    // Strip reasoning/thinking content blocks from the response
    if (output?.message?.content) {
      output.message.content = output.message.content.filter((c) => !c.reasoningContent);
    }

    const inputTokens = usage?.inputTokens || 0;
    const outputTokens = usage?.outputTokens || 0;
    const cacheReadTokens = usage?.cacheReadInputTokens || 0;
    const cacheWriteTokens = usage?.cacheWriteInputTokens || 0;
    const inlineCost = guardrail?.supportsInline
      ? guardrail.calculateCostFromResponse({ usage, trace })
      : 0;
    const guardrailCost = inlineCost + standaloneGuardrailCost;

    if (inputTokens > 0 || outputTokens > 0) {
      const cost = await trackChatUsage(
        userRecord,
        agent_id,
        modelRecord,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        guardrailCost
      );
      logger.info(
        `Usage tracked: user=${user_id}, agent=${agent_id}, model_id=${model_id}, input=${inputTokens}, output=${outputTokens}, cacheRead=${cacheReadTokens}, cacheWrite=${cacheWriteTokens}, guardrailCost=${guardrailCost.toFixed(6)}, cost=${cost.toFixed(6)}`
      );
    }

    res.json({ output, stopReason, usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }, metrics });
  }
}

// --- Embedding handler ---

async function handleEmbedding(req, res, userRecord, modelRecord) {
  const { messages, user_id, agent_id, model_id } = req.body;

  // Extract text from messages (string array for embedding, object array for chat format)
  const textInputs = typeof messages[0] === "string"
    ? messages
    : messages
        .filter((m) => m.role === "user")
        .flatMap((m) => m.content)
        .filter((c) => c.text)
        .map((c) => c.text);

  if (textInputs.length === 0) {
    return sendError(res, {
      errorType: ErrorType.INVALID_INPUT_FORMAT,
      message: "messages must contain at least one text content block",
    });
  }

  const input = textInputs.length === 1 ? textInputs[0] : textInputs;

  logger.info(`Embedding request from user: ${user_id}, agent: ${agent_id}, model_id: ${model_id}`);

  // Apply guardrail to input text if configured
  let guardrailCost = 0;
  if (guardrail) {
    const textToCheck = textInputs.join(" ");
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
  const provider = new providerMap[modelRecord.Provider.name]();
  const result = await provider.embed(modelRecord.internalName, input);

  // Track usage and update remaining balance
  const ip = req.ip || req.socket?.remoteAddress || null;
  const inputTokens = result.inputTokenCount || 0;
  const cost = await trackEmbeddingUsage(userRecord, modelRecord, inputTokens, ip, guardrailCost);
  logger.info(`Usage tracked: user=${user_id}, model_id=${model_id}, input=${inputTokens}, guardrailCost=${guardrailCost.toFixed(6)}, cost=${cost.toFixed(6)}`);

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
}

export default router;
