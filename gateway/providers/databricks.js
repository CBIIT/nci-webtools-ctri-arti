/**
 * Uses Azure Client Credentials OAuth flow to get a token,
 * then hits the NIH IDP Databricks serving endpoint.
 */

// TODO: configure this endpoint and any other configurations when using Gemini via IDP
const DATABRICKS_ENDPOINT = "databricks-claude-sonnet-4-6";
const SCOPE = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default";

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenFetchPromise = null;

/**
 * Translate Bedrock-style tool specs to OpenAI function-calling format.
 * Input:  [{ toolSpec: { name, description, inputSchema: { json: <schema> } } }]
 * Output: [{ type: "function", function: { name, description, parameters } }]
 */
function toOpenAITools(tools) {
  return tools.map(({ toolSpec }) => ({
    type: "function",
    function: {
      name: toolSpec.name,
      description: toolSpec.description ?? "",
      parameters: toolSpec.inputSchema?.json ?? { type: "object", properties: {} },
    },
  }));
}

/**
 * Normalize a Databricks/OpenAI finish_reason to the Bedrock stopReason vocab.
 */
function normalizeStopReason(reason) {
  switch (reason) {
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "stop":
    default:
      return "end_turn";
  }
}

/**
 * Translate a Databricks reasoning block to a Bedrock reasoningContent block.
 *
 * Databricks shape:
 *   { type: "reasoning", summary: [{ type: "summary_text", text: "...", signature: "..." }] }
 *
 * Bedrock shape:
 *   { reasoningContent: { reasoningText: { text: "...", signature: "..." } } }
 */
function normalizeReasoningBlock(block) {
  const summaryText = block.summary?.find((s) => s.type === "summary_text");
  return {
    reasoningContent: {
      reasoningText: {
        text: summaryText?.text ?? "",
        signature: summaryText?.signature ?? "",
      },
    },
  };
}

/**
 * Translate a Databricks/OpenAI-compat message to a Bedrock content block array.
 * Handles plain text, reasoning blocks, and tool_calls.
 *
 * Databricks returns content as an array of typed blocks:
 *   [{ type: "reasoning", summary: [...] }, { type: "text", text: "..." }]
 * OR for tool calls:
 *   message.tool_calls = [{ id, function: { name, arguments } }]
 */
function normalizeContent(message) {
  const blocks = [];

  // Content is an array of typed blocks (text + reasoning)
  if (Array.isArray(message?.content)) {
    for (const block of message.content) {
      if (block.type === "reasoning") {
        blocks.push(normalizeReasoningBlock(block));
      } else if (block.type === "text" && block.text) {
        blocks.push({ text: block.text });
      }
    }
  } else if (typeof message?.content === "string" && message.content) {
    // Fallback: plain string content (non-reasoning responses)
    blocks.push({ text: message.content });
  }

  // Tool calls live outside content on the message object
  for (const tc of message?.tool_calls ?? []) {
    blocks.push({
      toolUse: {
        toolUseId: tc.id,
        name: tc.function.name,
        input: (() => {
          try {
            return JSON.parse(tc.function.arguments);
          } catch {
            return tc.function.arguments;
          }
        })(),
      },
    });
  }

  return blocks;
}

/**
 * Converts our internal Bedrock-style message format to Databricks/OpenAI-compat format.
 *
 * Key translation:
 *   Bedrock reasoningContent blocks → Databricks reasoning blocks (for multi-turn)
 *   Bedrock toolUse blocks          → OpenAI tool_calls
 *   Bedrock toolResult blocks       → OpenAI tool role messages
 */
function toLLMFormatMessages(messages, system) {
  const result = [];

  if (system) {
    const systemText = Array.isArray(system)
      ? system
          .filter((b) => b?.text)
          .map((b) => b.text)
          .join("\n")
      : system;
    if (systemText) result.push({ role: "system", content: systemText });
  }

  for (const msg of messages) {
    // Simple string content — pass through directly
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    // Array of Bedrock content blocks — translate each
    if (Array.isArray(msg.content)) {
      const textBlocks = [];
      const toolCalls = [];
      const toolResults = [];
      const reasoningBlocks = [];

      for (const block of msg.content) {
        if (block.text !== undefined) {
          textBlocks.push({ type: "text", text: block.text });
        } else if (block.reasoningContent) {
          reasoningBlocks.push({
            type: "reasoning",
            summary: [
              {
                type: "summary_text",
                text: block.reasoningContent.reasoningText?.text ?? "",
                signature: block.reasoningContent.reasoningText?.signature ?? "",
              },
            ],
          });
        } else if (block.image) {
          const bytes = block.image.source?.bytes;
          const format = block.image.format ?? "jpeg";
          if (bytes) {
            const base64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
              "base64"
            );
            console.log("[image base64 tail]", base64.slice(-10));
            textBlocks.push({
              type: "image_url",
              image_url: { url: `data:image/${format};base64,${base64}` },
            });
          }
        } else if (block.document) {
          // Bedrock document block → OpenAI text block with content inlined
          // Databricks/OpenAI-compat has no native document type — flatten to text
          const source = block.document.source;
          if (source?.text) {
            textBlocks.push({ type: "text", text: source.text });
          } else if (source?.bytes) {
            const base64 = Buffer.from(source.bytes).toString("base64");
            textBlocks.push({
              type: "text",
              text: `[Document: ${block.document.name ?? "file"} (base64): ${base64}]`,
            });
          }
        } else if (block.toolUse) {
          toolCalls.push({
            id: block.toolUse.toolUseId,
            type: "function",
            function: {
              name: block.toolUse.name,
              arguments: JSON.stringify(block.toolUse.input ?? {}),
            },
          });
        } else if (block.toolResult) {
          toolResults.push({
            role: "tool",
            tool_call_id: block.toolResult.toolUseId,
            content: Array.isArray(block.toolResult.content)
              ? block.toolResult.content.map((c) => c.text ?? "").join("\n")
              : (block.toolResult.content ?? ""),
          });
        }
      }

      // Assistant message: combine reasoning + text blocks + tool_calls
      if (msg.role === "assistant") {
        const outMsg = {
          role: "assistant",
          content: [...reasoningBlocks, ...textBlocks],
        };
        if (toolCalls.length > 0) {
          outMsg.tool_calls = toolCalls;
        }
        result.push(outMsg);
      } else {
        // User or other roles: just content blocks
        result.push({ role: msg.role, content: [...reasoningBlocks, ...textBlocks] });
      }

      // Tool results are separate messages
      result.push(...toolResults);
      continue;
    }

    // Fallback: pass through as-is
    result.push({ role: msg.role, content: msg.content });
  }

  return result;
}

/**
 * Normalize Databricks response to our internal usage shape.
 */
function normalizeUsage(usage) {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteInputTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

export default class DatabricksProvider {
  /**
   * @param {object} providerRow - The Provider row from the database.
   *   providerRow.apiKey may be a JSON string or already-parsed object
   *   containing { tenantId, clientId, clientSecret, databricksHost }.
   *   Falls back to environment variables for any missing values.
   */
  constructor(providerRow = {}) {
    let config = {};

    if (providerRow.apiKey) {
      config =
        typeof providerRow.apiKey === "string"
          ? JSON.parse(providerRow.apiKey)
          : providerRow.apiKey;
    }

    this.tenantId = config?.tenantId ?? process.env.AZURE_TENANT_ID;
    this.clientId = config?.clientId ?? process.env.AZURE_CLIENT_ID;
    this.clientSecret = config?.clientSecret ?? process.env.AZURE_CLIENT_SECRET;
    this.databricksHost = config?.databricksHost ?? process.env.DATABRICKS_HOST;
  }

  async getAccessToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

    if (tokenFetchPromise) return tokenFetchPromise;

    tokenFetchPromise = (async () => {
      try {
        const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: SCOPE,
        });

        const res = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params,
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Databricks token fetch failed [${res.status}]: ${err}`);
        }

        const data = await res.json();
        cachedToken = data.access_token;
        tokenExpiresAt = Date.now() + data.expires_in * 1000;
        return cachedToken;
      } finally {
        tokenFetchPromise = null;
      }
    })();

    return tokenFetchPromise;
  }

  async converse({
    modelId,
    messages,
    system,
    inferenceConfig,
    toolConfig,
    additionalModelRequestFields,
  }) {
    const token = await this.getAccessToken();
    const url = `${this.databricksHost}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`;

    // Translate Bedrock toolConfig → OpenAI tools array
    // toolConfig.tools may include a trailing cachePoint — filter those out
    const tools = toolConfig?.tools?.filter((t) => t.toolSpec) ?? [];

    // Translate Bedrock additionalModelRequestFields.thinking → Databricks thinking
    const thinking = additionalModelRequestFields?.thinking;

    const body = {
      messages: toLLMFormatMessages(messages, system),
      max_tokens: inferenceConfig?.maxTokens ?? 2000,
      temperature: inferenceConfig?.temperature ?? 0.7,
      stream: false,
      ...(tools.length && { tools: toOpenAITools(tools) }),
      ...(thinking?.type === "enabled" && {
        thinking: {
          type: "enabled",
          budget_tokens: thinking.budget_tokens ?? 10000,
        },
      }),
    };

    console.log("[databricks request body]", JSON.stringify(body, null, 2));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      cachedToken = null;
      return this.converse({ modelId, messages, system, inferenceConfig, tools, thinking });
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Databricks inference failed [${res.status}]: ${err}`);
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message;
    const content = normalizeContent(message);

    return {
      output: { message: { role: "assistant", content } },
      usage: normalizeUsage(data.usage),
      stopReason: normalizeStopReason(data.choices?.[0]?.finish_reason),
    };
  }

  async converseStream({
    modelId,
    messages,
    system,
    inferenceConfig,
    toolConfig,
    additionalModelRequestFields,
  }) {
    const token = await this.getAccessToken();
    const url = `${this.databricksHost}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`;

    const tools = toolConfig?.tools?.filter((t) => t.toolSpec) ?? [];

    const thinking = additionalModelRequestFields?.thinking;

    const body = {
      messages: toLLMFormatMessages(messages, system),
      max_tokens: inferenceConfig?.maxTokens ?? 2000,
      temperature: inferenceConfig?.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
      ...(tools.length && { tools: toOpenAITools(tools) }),
      ...(thinking?.type === "enabled" && {
        thinking: {
          type: "enabled",
          budget_tokens: thinking.budget_tokens ?? 10000,
        },
      }),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      cachedToken = null;
      return this.converseStream({ modelId, messages, system, inferenceConfig, tools, thinking });
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Databricks stream failed [${res.status}]: ${err}`);
    }

    return {
      stream: (async function* () {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let usage = null;

        // Track open blocks by index so we can emit start/stop correctly.
        // Databricks streams content as an array — each index is a separate block.
        // Block types we care about: "text" and "reasoning"
        const openBlocks = new Map(); // contentBlockIndex → "text" | "reasoning"
        let nextBlockIndex = 0;

        // ── messageStart ──────────────────────────────────────────────────
        yield {
          type: "messageStart",
          messageStart: { role: "assistant" },
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const payload = trimmed.slice(6).trim();
            if (payload.startsWith("[DONE")) continue;

            let chunk;
            try {
              chunk = JSON.parse(payload);
            } catch {
              console.error("Databricks stream parse error:", trimmed);
              continue;
            }

            if (chunk.usage) {
              usage = normalizeUsage(chunk.usage);
            }

            const delta = chunk.choices?.[0]?.delta;
            const finishReason = chunk.choices?.[0]?.finish_reason;

            if (delta) {
              // delta.content is an array of typed blocks when reasoning is active,
              // or a plain string for standard text-only responses.
              const contentBlocks = Array.isArray(delta.content)
                ? delta.content
                : delta.content
                  ? [{ type: "text", text: delta.content }]
                  : [];

              for (const block of contentBlocks) {
                if (block.type === "reasoning") {
                  // Reasoning block — extract the summary text delta
                  const summaryDelta = block.summary?.find((s) => s.type === "summary_text");
                  if (!summaryDelta?.text) continue;

                  // Open a new reasoning block if not already open at this index
                  const blockIndex = nextBlockIndex;
                  if (!openBlocks.has(blockIndex)) {
                    openBlocks.set(blockIndex, "reasoning");
                    nextBlockIndex++;
                    yield {
                      type: "contentBlockStart",
                      contentBlockStart: {
                        contentBlockIndex: blockIndex,
                        start: { reasoningContent: {} },
                      },
                    };
                  }

                  yield {
                    type: "contentBlockDelta",
                    contentBlockDelta: {
                      contentBlockIndex: blockIndex,
                      delta: {
                        reasoningContent: { text: summaryDelta.text },
                      },
                    },
                  };
                } else if (block.type === "text" && block.text) {
                  // Standard text block
                  const blockIndex = nextBlockIndex;
                  if (!openBlocks.has(blockIndex)) {
                    openBlocks.set(blockIndex, "text");
                    nextBlockIndex++;
                    yield {
                      type: "contentBlockStart",
                      contentBlockStart: {
                        contentBlockIndex: blockIndex,
                        start: { text: {} },
                      },
                    };
                  }

                  yield {
                    type: "contentBlockDelta",
                    contentBlockDelta: {
                      contentBlockIndex: blockIndex,
                      delta: { text: block.text },
                    },
                  };
                }
              }

              // Tool call deltas — accumulate arguments across chunks
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const blockIndex = tc.index ?? nextBlockIndex;

                  if (!openBlocks.has(blockIndex)) {
                    openBlocks.set(blockIndex, "toolUse");
                    nextBlockIndex = Math.max(nextBlockIndex, blockIndex + 1);
                    yield {
                      type: "contentBlockStart",
                      contentBlockStart: {
                        contentBlockIndex: blockIndex,
                        start: {
                          toolUse: {
                            toolUseId: tc.id ?? "",
                            name: tc.function?.name ?? "",
                          },
                        },
                      },
                    };
                  }

                  if (tc.function?.arguments) {
                    yield {
                      type: "contentBlockDelta",
                      contentBlockDelta: {
                        contentBlockIndex: blockIndex,
                        delta: { toolUse: { input: tc.function.arguments } },
                      },
                    };
                  }
                }
              }
            }

            if (finishReason) {
              // Close all open blocks in order
              for (const [blockIndex] of [...openBlocks].sort((a, b) => a[0] - b[0])) {
                yield {
                  type: "contentBlockStop",
                  contentBlockStop: { contentBlockIndex: blockIndex },
                };
              }
              openBlocks.clear();

              yield {
                type: "messageStop",
                messageStop: { stopReason: normalizeStopReason(finishReason) },
              };
            }
          }
        }

        // Safety net: close any blocks that never got a finish_reason
        for (const [blockIndex] of [...openBlocks].sort((a, b) => a[0] - b[0])) {
          yield {
            type: "contentBlockStop",
            contentBlockStop: { contentBlockIndex: blockIndex },
          };
        }

        // ── metadata — always last ────────────────────────────────────────
        yield {
          type: "metadata",
          metadata: {
            usage: usage ?? {
              inputTokens: 0,
              outputTokens: 0,
              cacheReadInputTokens: 0,
              cacheWriteInputTokens: 0,
            },
          },
        };
      })(),
    };
  }
}
