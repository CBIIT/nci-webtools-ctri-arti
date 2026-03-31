import { NOVA_EMBEDDING_DIMENSIONS } from "shared/embeddings.js";
import { estimateEmbeddingTextTokens } from "shared/token-estimation.js";

const DEFAULT_USAGE = {
  inputTokens: 100,
  outputTokens: 50,
  totalTokens: 150,
};

const DEFAULT_METRICS = {
  latencyMs: 50,
};

function getLastUserText(input = {}) {
  const lastUserMessage = [...(input.messages || [])]
    .reverse()
    .find((message) => message.role === "user");
  const text = (lastUserMessage?.content || [])
    .map((block) => (typeof block.text === "string" ? block.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createScriptedError(value) {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);

  const message = value?.message || "Scripted model error";
  const error = new Error(message);
  if (value?.name) error.name = value.name;
  if (value?.code) error.code = value.code;
  if (value?.status) error.status = value.status;
  if (value?.statusCode) error.statusCode = value.statusCode;
  return error;
}

function normalizeToolInput(value) {
  if (value === undefined) return {};
  if (typeof value !== "string") return value;
  return parseJson(value) ?? { text: value };
}

function stringifyToolInput(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? {});
}

function normalizeToolUse(toolUse, input) {
  const requested = toolUse || {};
  const defaultName = input.toolConfig?.tools?.[0]?.toolSpec?.name || "search";
  return {
    toolUseId: requested.toolUseId || requested.id || "scripted_tool_1",
    name: requested.name || defaultName,
    input: normalizeToolInput(requested.input),
  };
}

function createTextResponse(text, overrides = {}) {
  return {
    output: {
      message: {
        role: "assistant",
        content: [{ text }],
      },
    },
    stopReason: overrides.stopReason || "end_turn",
    usage: overrides.usage || DEFAULT_USAGE,
    metrics: overrides.metrics || DEFAULT_METRICS,
    ...(overrides.trace ? { trace: overrides.trace } : {}),
  };
}

function createToolUseResponse(toolUse, overrides = {}) {
  return {
    output: {
      message: {
        role: "assistant",
        content: [{ toolUse }],
      },
    },
    stopReason: overrides.stopReason || "tool_use",
    usage: overrides.usage || DEFAULT_USAGE,
    metrics: overrides.metrics || DEFAULT_METRICS,
    ...(overrides.trace ? { trace: overrides.trace } : {}),
  };
}

function createTextStreamEvents(text, overrides = {}) {
  return [
    { type: "messageStart", messageStart: { role: "assistant" } },
    {
      type: "contentBlockStart",
      contentBlockStart: { contentBlockIndex: 0, start: { text: {} } },
    },
    {
      type: "contentBlockDelta",
      contentBlockDelta: { contentBlockIndex: 0, delta: { text } },
    },
    { type: "contentBlockStop", contentBlockStop: { contentBlockIndex: 0 } },
    { type: "messageStop", messageStop: { stopReason: overrides.stopReason || "end_turn" } },
    {
      type: "metadata",
      metadata: {
        usage: overrides.usage || DEFAULT_USAGE,
        metrics: overrides.metrics || DEFAULT_METRICS,
        ...(overrides.trace ? { trace: overrides.trace } : {}),
      },
    },
  ];
}

function createToolUseStreamEvents(toolUse, overrides = {}) {
  return [
    { type: "messageStart", messageStart: { role: "assistant" } },
    {
      type: "contentBlockStart",
      contentBlockStart: {
        contentBlockIndex: 0,
        start: { toolUse: { toolUseId: toolUse.toolUseId, name: toolUse.name } },
      },
    },
    {
      type: "contentBlockDelta",
      contentBlockDelta: {
        contentBlockIndex: 0,
        delta: { toolUse: { input: stringifyToolInput(toolUse.input) } },
      },
    },
    { type: "contentBlockStop", contentBlockStop: { contentBlockIndex: 0 } },
    { type: "messageStop", messageStop: { stopReason: overrides.stopReason || "tool_use" } },
    {
      type: "metadata",
      metadata: {
        usage: overrides.usage || DEFAULT_USAGE,
        metrics: overrides.metrics || DEFAULT_METRICS,
        ...(overrides.trace ? { trace: overrides.trace } : {}),
      },
    },
  ];
}

function createScriptedState() {
  return {
    response: null,
    error: null,
    stream: null,
  };
}

// Deterministic provider for tests:
// - plain text input echoes the latest user text
// - JSON input can script tool use, full responses, or errors
export default class ScriptedProvider {
  constructor() {
    this.state = createScriptedState();
  }

  setScriptedResponse(response) {
    this.state.response = response;
    this.state.error = null;
    this.state.stream = null;
  }

  setScriptedError(error) {
    this.state.error = error;
    this.state.response = null;
    this.state.stream = null;
  }

  setScriptedStream(stream) {
    this.state.stream = stream;
    this.state.response = null;
    this.state.error = null;
  }

  setMockResponse(response) {
    this.setScriptedResponse(response);
  }

  setMockError(error) {
    this.setScriptedError(error);
  }

  setMockStream(stream) {
    this.setScriptedStream(stream);
  }

  reset() {
    this.state = createScriptedState();
  }

  getScript(input) {
    const rawText = getLastUserText(input);
    const parsed = parseJson(rawText);
    return { rawText, parsed };
  }

  resolveScriptedResult(input) {
    if (this.state.error) {
      throw createScriptedError(this.state.error);
    }

    if (this.state.response) {
      return { kind: "response", value: this.state.response };
    }

    const { rawText, parsed } = this.getScript(input);
    if (parsed?.error) {
      throw createScriptedError(parsed.error);
    }
    if (parsed?.stream && Array.isArray(parsed.stream)) {
      return { kind: "stream", value: parsed.stream };
    }
    if (parsed?.response) {
      return { kind: "response", value: parsed.response };
    }
    if (parsed?.output || parsed?.stopReason) {
      return { kind: "response", value: parsed };
    }
    if (parsed?.toolUse) {
      return { kind: "toolUse", value: normalizeToolUse(parsed.toolUse, input) };
    }
    if (typeof parsed?.text === "string") {
      return { kind: "text", value: parsed.text };
    }
    return { kind: "text", value: rawText };
  }

  async converse(input) {
    const scripted = this.resolveScriptedResult(input);

    if (scripted.kind === "response") {
      return scripted.value;
    }

    if (scripted.kind === "toolUse") {
      return createToolUseResponse(scripted.value);
    }

    return createTextResponse(scripted.value || "Scripted model response");
  }

  async converseStream(input) {
    if (this.state.error) {
      throw createScriptedError(this.state.error);
    }

    if (this.state.stream) {
      return { stream: this.createStream(this.state.stream), $metadata: {} };
    }

    const scripted = this.resolveScriptedResult(input);

    if (scripted.kind === "stream") {
      return { stream: this.createStream(scripted.value), $metadata: {} };
    }

    if (scripted.kind === "response") {
      const response = scripted.value;
      const toolUse = response?.output?.message?.content?.find((block) => block.toolUse)?.toolUse;
      const text = response?.output?.message?.content?.find(
        (block) => block.text !== undefined
      )?.text;
      const overrides = {
        stopReason: response?.stopReason,
        usage: response?.usage,
        metrics: response?.metrics,
        trace: response?.trace,
      };
      const events = toolUse
        ? createToolUseStreamEvents(normalizeToolUse(toolUse, input), overrides)
        : createTextStreamEvents(text || "", overrides);
      return { stream: this.createStream(events), $metadata: {} };
    }

    if (scripted.kind === "toolUse") {
      return {
        stream: this.createStream(createToolUseStreamEvents(scripted.value)),
        $metadata: {},
      };
    }

    return {
      stream: this.createStream(
        createTextStreamEvents(scripted.value || "Scripted model response")
      ),
      $metadata: {},
    };
  }

  async embed(
    modelId,
    content,
    { purpose = "GENERIC_INDEX", dimension = NOVA_EMBEDDING_DIMENSIONS } = {}
  ) {
    const text = typeof content === "string" ? content : `[${content.image ? "image" : "media"}]`;
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
    }
    const embedding = Array.from({ length: dimension }, (_, index) => {
      const value = (hash + (index + 1) * 2654435761) % 1000;
      return value / 1000;
    });
    return {
      embedding,
      inputTextTokenCount: typeof content === "string" ? estimateEmbeddingTextTokens(content) : 0,
    };
  }

  async *createStream(events) {
    for (const event of events) {
      yield event;
    }
  }
}
