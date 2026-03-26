// #region 1. CONSTANTS
const TOKEN_SCOPE = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default";
const CHAT_COMPLETIONS_PATH = "/serving-endpoints/chat/completions";
const EMPTY_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
};
const LEGACY_MODEL_ALIASES = {
  "idp.us.anthropic.claude-sonnet-4-6": "databricks-claude-sonnet-4-6",
  "idp.us.anthropic.claude-opus-4-6-v1": "databricks-claude-opus-4-6",
};
const DOCUMENT_MEDIA_TYPES = {
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xml: "application/xml",
};
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2000;
// #endregion

// #region 2. CONFIG & JSON HELPERS
function parseJsonObject(raw, label, { fallback = undefined } = {}) {
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  if (typeof raw === "object") {
    return raw;
  }
  if (typeof raw !== "string") {
    throw new Error(`${label} must be a JSON string or object`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function resolveEnvRefs(value) {
  if (Array.isArray(value)) {
    return value.map(resolveEnvRefs);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveEnvRefs(item)])
    );
  }
  if (typeof value === "string" && value.startsWith("env:")) {
    return process.env[value.slice(4)] ?? null;
  }
  return value;
}

function parseProviderConfig(raw) {
  return resolveEnvRefs(parseJsonObject(raw, "Databricks provider apiKey", { fallback: {} }));
}

function parseAdditionalFields(raw) {
  return parseJsonObject(raw, "Databricks additionalModelRequestFields", { fallback: {} }) || {};
}

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// #endregion

// #region 3. REQUEST TRANSLATION
function encodeBytes(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

function buildDocumentMediaType(format = "octet-stream") {
  if (!format) return "application/octet-stream";
  if (format.includes("/")) return format;
  return DOCUMENT_MEDIA_TYPES[format.toLowerCase()] || `application/${format}`;
}

function normalizeToolResultContent(content = []) {
  if (!Array.isArray(content)) {
    return typeof content === "string" ? content : JSON.stringify(content ?? {});
  }

  const jsonBlock = content.find((item) => item?.json !== undefined);
  if (jsonBlock) return JSON.stringify(jsonBlock.json);

  const text = content
    .filter((item) => item?.text !== undefined)
    .map((item) => item.text)
    .join("\n")
    .trim();
  if (text) return text;

  return JSON.stringify(content);
}

function applyCacheControl(target, block) {
  if (!block?.cachePoint || target.length === 0) return false;
  target[target.length - 1].cache_control = {
    type: block.cachePoint.type === "default" ? "ephemeral" : block.cachePoint.type,
  };
  return true;
}

function toOpenAITools(tools = []) {
  const result = [];
  for (const item of tools) {
    if (applyCacheControl(result, item)) continue;
    if (!item?.toolSpec) continue;
    result.push({
      type: "function",
      function: {
        name: item.toolSpec.name,
        description: item.toolSpec.description || "",
        parameters: item.toolSpec.inputSchema?.json || { type: "object", properties: {} },
      },
    });
  }
  return result;
}

function toOpenAIToolChoice(toolChoice) {
  if (!toolChoice) return undefined;
  if (toolChoice.auto) return "auto";
  if (toolChoice.any) return "required";
  if (toolChoice.tool?.name) {
    return {
      type: "function",
      function: { name: toolChoice.tool.name },
    };
  }
  return undefined;
}

function toOpenAIContentItem(block) {
  if (block.text !== undefined) {
    return { type: "text", text: block.text };
  }

  if (block.reasoningContent) {
    const reasoningText = block.reasoningContent.reasoningText || {};
    const summary = [];
    if (reasoningText.text) {
      summary.push({
        type: "summary_text",
        text: reasoningText.text,
        ...(reasoningText.signature ? { signature: reasoningText.signature } : {}),
      });
    }
    return { type: "reasoning", summary };
  }

  if (block.image?.source?.bytes) {
    const format = block.image.format || "png";
    return {
      type: "image_url",
      image_url: { url: `data:image/${format};base64,${encodeBytes(block.image.source.bytes)}` },
    };
  }

  if (block.document) {
    const mediaType = buildDocumentMediaType(block.document.format);
    const source = block.document.source || {};
    const item = {
      type: "document",
      title: block.document.name,
      citations: { enabled: true },
    };

    if (source.text) {
      item.source = {
        type: "text",
        media_type: mediaType,
        data: source.text,
      };
      return item;
    }

    if (source.bytes) {
      item.source = {
        type: "base64",
        media_type: mediaType,
        data: encodeBytes(source.bytes),
      };
      return item;
    }
  }

  return null;
}

function toOpenAISystemMessage(system = []) {
  const content = [];
  for (const block of system) {
    if (applyCacheControl(content, block)) continue;
    const item = toOpenAIContentItem(block);
    if (item) content.push(item);
  }
  return content.length > 0 ? { role: "system", content } : null;
}

function toOpenAIMessage(message) {
  if (typeof message.content === "string") {
    return [{ role: message.role, content: message.content }];
  }

  const content = [];
  const toolCalls = [];
  const toolMessages = [];

  for (const block of message.content || []) {
    if (applyCacheControl(content, block)) continue;

    if (block.toolUse && message.role === "assistant") {
      toolCalls.push({
        id: block.toolUse.toolUseId,
        type: "function",
        function: {
          name: block.toolUse.name,
          arguments: JSON.stringify(block.toolUse.input || {}),
        },
      });
      continue;
    }

    if (block.toolResult && message.role === "user") {
      toolMessages.push({
        role: "tool",
        tool_call_id: block.toolResult.toolUseId,
        content: normalizeToolResultContent(block.toolResult.content),
      });
      continue;
    }

    const item = toOpenAIContentItem(block);
    if (item) content.push(item);
  }

  const result = [];
  if (message.role === "assistant") {
    result.push({
      role: "assistant",
      ...(content.length > 0 ? { content } : { content: null }),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });
  } else if (content.length > 0 || toolMessages.length === 0) {
    result.push({
      role: message.role,
      content: content.length > 0 ? content : "",
    });
  }

  result.push(...toolMessages);
  return result;
}

function toOpenAIMessages(messages = [], system = []) {
  const result = [];
  const systemMessage = toOpenAISystemMessage(system);
  if (systemMessage) result.push(systemMessage);
  for (const message of messages) {
    result.push(...toOpenAIMessage(message));
  }
  return result;
}

function resolveDatabricksModelId(modelId) {
  return LEGACY_MODEL_ALIASES[modelId] || modelId.replace(/^idp\./, "");
}
// #endregion

// #region 4. RESPONSE TRANSLATION
function normalizeStopReason(reason) {
  switch (reason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "content_filtered";
    case "stop_sequence":
      return "stop_sequence";
    default:
      return "end_turn";
  }
}

function normalizeReasoningBlock(block) {
  const summary = block.summary?.find((item) => item.type === "summary_text");
  return {
    reasoningContent: {
      reasoningText: {
        text: summary?.text || "",
        ...(summary?.signature ? { signature: summary.signature } : {}),
      },
    },
  };
}

function normalizeToolCalls(message, output) {
  for (const toolCall of message?.tool_calls || []) {
    let input = toolCall.function?.arguments || "{}";
    try {
      input = JSON.parse(input);
    } catch {
      // Keep invalid JSON as a raw string so downstream tooling can inspect it.
    }
    output.push({
      toolUse: {
        toolUseId: toolCall.id,
        name: toolCall.function?.name || "",
        input,
      },
    });
  }
}

function normalizeMessageContent(message) {
  const output = [];
  const content = message?.content;

  if (typeof content === "string") {
    if (content) output.push({ text: content });
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "reasoning") {
        output.push(normalizeReasoningBlock(block));
      } else if (block.type === "text") {
        output.push({ text: block.text || "" });
      }
    }
  }

  normalizeToolCalls(message, output);
  if (output.length === 0) output.push({ text: "" });
  return output;
}

function normalizeUsage(usage = {}) {
  return {
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    cacheReadInputTokens: usage.cache_read_input_tokens || 0,
    cacheWriteInputTokens: usage.cache_creation_input_tokens || 0,
    ...(usage.total_tokens ? { totalTokens: usage.total_tokens } : {}),
  };
}
// #endregion

// #region 5. STREAM HELPERS
function parseSsePayload(payload) {
  if (payload === "[DONE]") return { done: true };
  try {
    return { done: false, value: JSON.parse(payload) };
  } catch (error) {
    throw new Error(`Databricks stream chunk was not valid JSON: ${error.message}`);
  }
}

async function* parseSse(responseBody) {
  if (!responseBody) {
    throw new Error("Databricks stream response had no body");
  }

  const reader = responseBody.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || "";

    for (const frame of frames) {
      const dataLines = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      for (const payload of dataLines) {
        const parsed = parseSsePayload(payload);
        if (parsed.done) return;
        yield parsed.value;
      }
    }
  }

  const finalFrame = buffer.trim();
  if (!finalFrame) return;

  for (const line of finalFrame.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const parsed = parseSsePayload(line.slice(5).trim());
    if (parsed.done) return;
    yield parsed.value;
  }
}

function createStreamErrorEvent(error) {
  return {
    type: "error",
    error: {
      internalServerError: {
        message: `Databricks stream error: ${error.message}`,
      },
    },
  };
}
// #endregion

// #region 6. PROVIDER
export default class DatabricksProvider {
  constructor(providerRow = {}) {
    const config = parseProviderConfig(providerRow.apiKey);
    this.tenantId = config.tenantId || process.env.AZURE_TENANT_ID;
    this.clientId = config.clientId || process.env.AZURE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.AZURE_CLIENT_SECRET;
    this.databricksHost = (config.databricksHost || process.env.DATABRICKS_HOST || "").replace(
      /\/+$/,
      ""
    );
    this.maxRetries = Number.parseInt(
      process.env.DATABRICKS_MAX_RETRIES || String(DEFAULT_MAX_RETRIES),
      10
    );
    this.retryBaseDelayMs = Number.parseInt(
      process.env.DATABRICKS_RETRY_BASE_DELAY_MS || String(DEFAULT_RETRY_BASE_DELAY_MS),
      10
    );
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
    this.tokenFetchPromise = null;
  }

  async getAccessToken() {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt - 60_000) {
      return this.cachedToken;
    }
    if (this.tokenFetchPromise) {
      return this.tokenFetchPromise;
    }
    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      throw new Error("Databricks provider is missing Azure client credentials");
    }

    this.tokenFetchPromise = (async () => {
      try {
        const response = await fetch(
          `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: this.clientId,
              client_secret: this.clientSecret,
              scope: TOKEN_SCOPE,
            }),
          }
        );

        const text = await response.text();
        const data = parseJsonObject(text, "Databricks token response", { fallback: {} }) || {};
        if (!response.ok) {
          throw new Error(`Databricks token fetch failed [${response.status}]: ${text}`);
        }

        this.cachedToken = data.access_token;
        this.tokenExpiresAt = Date.now() + (data.expires_in || 0) * 1000;
        return this.cachedToken;
      } finally {
        this.tokenFetchPromise = null;
      }
    })();

    return this.tokenFetchPromise;
  }

  buildRequestBody({
    modelId,
    messages,
    system,
    inferenceConfig,
    toolConfig,
    additionalModelRequestFields,
    stream = false,
  }) {
    const tools = toOpenAITools(toolConfig?.tools || []);
    const additionalFields = parseAdditionalFields(additionalModelRequestFields);
    const toolChoice = toOpenAIToolChoice(toolConfig?.toolChoice);

    return Object.fromEntries(
      Object.entries({
        model: resolveDatabricksModelId(modelId),
        messages: toOpenAIMessages(messages, system),
        max_tokens: inferenceConfig?.maxTokens,
        temperature: inferenceConfig?.temperature,
        top_p: inferenceConfig?.topP,
        ...(inferenceConfig?.stopSequences?.length ? { stop: inferenceConfig.stopSequences } : {}),
        ...(tools.length > 0 ? { tools } : {}),
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
        ...additionalFields,
      }).filter(([, value]) => value !== undefined)
    );
  }

  getRetryDelayMs(attempt) {
    if (this.retryBaseDelayMs <= 0) return 0;
    return Math.min(this.retryBaseDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS);
  }

  async fetchChatCompletions(body, { retryUnauthorized = true } = {}) {
    if (!this.databricksHost) {
      throw new Error("Databricks provider is missing DATABRICKS_HOST");
    }

    let attempt = 0;
    let canRetryUnauthorized = retryUnauthorized;

    while (true) {
      const token = await this.getAccessToken();
      let response;
      try {
        response = await fetch(`${this.databricksHost}${CHAT_COMPLETIONS_PATH}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await sleep(this.getRetryDelayMs(attempt));
        attempt += 1;
        continue;
      }

      if (response.status === 401 && canRetryUnauthorized) {
        this.cachedToken = null;
        this.tokenExpiresAt = 0;
        canRetryUnauthorized = false;
        if (attempt >= this.maxRetries) {
          return response;
        }
        attempt += 1;
        continue;
      }

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt >= this.maxRetries) {
        return response;
      }

      await response.text();
      await sleep(this.getRetryDelayMs(attempt));
      attempt += 1;
    }
  }

  async converse(input) {
    const startedAt = Date.now();
    const response = await this.fetchChatCompletions(this.buildRequestBody(input));
    const text = await response.text();
    const data = parseJsonObject(text, "Databricks chat response", { fallback: {} }) || {};

    if (!response.ok) {
      throw new Error(`Databricks inference failed [${response.status}]: ${text}`);
    }

    const choice = data.choices?.[0] || {};
    return {
      output: {
        message: {
          role: "assistant",
          content: normalizeMessageContent(choice.message),
        },
      },
      usage: normalizeUsage(data.usage),
      stopReason: normalizeStopReason(choice.finish_reason),
      metrics: { latencyMs: Date.now() - startedAt },
    };
  }

  async converseStream(input) {
    const startedAt = Date.now();
    const response = await this.fetchChatCompletions(
      this.buildRequestBody({ ...input, stream: true })
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Databricks stream failed [${response.status}]: ${text}`);
    }

    return {
      stream: (async function* () {
        let usage = EMPTY_USAGE;
        let stopReason = "end_turn";
        let nextBlockIndex = 0;
        let activeTextBlock = null;
        let activeReasoningBlock = null;
        const activeToolBlocks = new Map();
        let messageStopped = false;

        const closeBlock = async function* (blockIndex) {
          if (blockIndex === null || blockIndex === undefined) return;
          yield {
            type: "contentBlockStop",
            contentBlockStop: { contentBlockIndex: blockIndex },
          };
        };

        const closeOpenTextAndReasoning = async function* () {
          if (activeReasoningBlock !== null) {
            yield* closeBlock(activeReasoningBlock);
            activeReasoningBlock = null;
          }
          if (activeTextBlock !== null) {
            yield* closeBlock(activeTextBlock);
            activeTextBlock = null;
          }
        };

        try {
          yield { type: "messageStart", messageStart: { role: "assistant" } };

          for await (const chunk of parseSse(response.body)) {
            if (chunk.usage) {
              usage = normalizeUsage(chunk.usage);
            }

            const choice = chunk.choices?.[0] || {};
            const delta = choice.delta || {};
            if (choice.finish_reason) {
              stopReason = normalizeStopReason(choice.finish_reason);
            }

            const contentBlocks = Array.isArray(delta.content)
              ? delta.content
              : typeof delta.content === "string" && delta.content
                ? [{ type: "text", text: delta.content }]
                : [];

            for (const block of contentBlocks) {
              if (block.type === "reasoning") {
                const summary = block.summary?.find((item) => item.type === "summary_text");
                if (!summary?.text && !summary?.signature) continue;
                if (activeTextBlock !== null) {
                  yield* closeBlock(activeTextBlock);
                  activeTextBlock = null;
                }
                if (activeReasoningBlock === null) {
                  activeReasoningBlock = nextBlockIndex++;
                  yield {
                    type: "contentBlockStart",
                    contentBlockStart: {
                      contentBlockIndex: activeReasoningBlock,
                      start: { reasoningContent: {} },
                    },
                  };
                }
                yield {
                  type: "contentBlockDelta",
                  contentBlockDelta: {
                    contentBlockIndex: activeReasoningBlock,
                    delta: {
                      reasoningContent: {
                        ...(summary?.text ? { text: summary.text } : {}),
                        ...(summary?.signature ? { signature: summary.signature } : {}),
                      },
                    },
                  },
                };
                continue;
              }

              if (block.type === "text" && block.text) {
                if (activeReasoningBlock !== null) {
                  yield* closeBlock(activeReasoningBlock);
                  activeReasoningBlock = null;
                }
                if (activeTextBlock === null) {
                  activeTextBlock = nextBlockIndex++;
                  yield {
                    type: "contentBlockStart",
                    contentBlockStart: {
                      contentBlockIndex: activeTextBlock,
                      start: { text: {} },
                    },
                  };
                }
                yield {
                  type: "contentBlockDelta",
                  contentBlockDelta: {
                    contentBlockIndex: activeTextBlock,
                    delta: { text: block.text },
                  },
                };
              }
            }

            for (const toolCall of delta.tool_calls || []) {
              if (activeReasoningBlock !== null) {
                yield* closeBlock(activeReasoningBlock);
                activeReasoningBlock = null;
              }
              if (activeTextBlock !== null) {
                yield* closeBlock(activeTextBlock);
                activeTextBlock = null;
              }

              const toolKey = toolCall.index ?? activeToolBlocks.size;
              let state = activeToolBlocks.get(toolKey);
              if (!state) {
                state = {
                  blockIndex: nextBlockIndex++,
                  started: false,
                  closed: false,
                  toolUseId: toolCall.id || `databricks_tool_${toolKey}`,
                  name: toolCall.function?.name || "",
                };
                activeToolBlocks.set(toolKey, state);
              }

              if (toolCall.id) state.toolUseId = toolCall.id;
              if (toolCall.function?.name) state.name = toolCall.function.name;

              if (!state.started) {
                state.started = true;
                yield {
                  type: "contentBlockStart",
                  contentBlockStart: {
                    contentBlockIndex: state.blockIndex,
                    start: {
                      toolUse: {
                        toolUseId: state.toolUseId,
                        name: state.name,
                      },
                    },
                  },
                };
              }

              if (toolCall.function?.arguments) {
                yield {
                  type: "contentBlockDelta",
                  contentBlockDelta: {
                    contentBlockIndex: state.blockIndex,
                    delta: {
                      toolUse: {
                        input: toolCall.function.arguments,
                      },
                    },
                  },
                };
              }
            }

            if (choice.finish_reason && !messageStopped) {
              yield* closeOpenTextAndReasoning();
              for (const state of activeToolBlocks.values()) {
                if (state.started && !state.closed) {
                  state.closed = true;
                  yield {
                    type: "contentBlockStop",
                    contentBlockStop: { contentBlockIndex: state.blockIndex },
                  };
                }
              }
              yield { type: "messageStop", messageStop: { stopReason } };
              messageStopped = true;
            }
          }

          if (!messageStopped) {
            yield* closeOpenTextAndReasoning();
            for (const state of activeToolBlocks.values()) {
              if (state.started && !state.closed) {
                state.closed = true;
                yield {
                  type: "contentBlockStop",
                  contentBlockStop: { contentBlockIndex: state.blockIndex },
                };
              }
            }
            yield { type: "messageStop", messageStop: { stopReason } };
          }
        } catch (error) {
          yield createStreamErrorEvent(error);
        }

        yield {
          type: "metadata",
          metadata: {
            usage,
            metrics: { latencyMs: Date.now() - startedAt },
          },
        };
      })(),
      $metadata: {},
    };
  }
}
// #endregion
