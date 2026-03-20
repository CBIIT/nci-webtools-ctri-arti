import { NOVA_EMBEDDING_DIMENSIONS } from "shared/embeddings.js";
import { estimateEmbeddingTextTokens } from "shared/token-estimation.js";

// Test provider for mocking AI responses in tests
export default class MockProvider {
  constructor() {
    this.mockResponse = null;
    this.mockError = null;
    this.mockStream = null;
  }

  // Set mock response for non-streaming calls
  setMockResponse(response) {
    this.mockResponse = response;
    this.mockError = null;
    this.mockStream = null;
  }

  // Set mock error for calls
  setMockError(error) {
    this.mockError = error;
    this.mockResponse = null;
    this.mockStream = null;
  }

  // Set mock streaming response
  setMockStream(streamData) {
    this.mockStream = streamData;
    this.mockResponse = null;
    this.mockError = null;
  }

  // Reset all mocks
  reset() {
    this.mockResponse = null;
    this.mockError = null;
    this.mockStream = null;
  }

  /**
   * Mock non-streaming converse method
   * @param {object} input - Bedrock-style input
   * @returns {Promise<object>} Bedrock-style response
   */
  async converse(_input) {
    if (this.mockError) {
      throw this.mockError;
    }

    if (this.mockResponse) {
      return this.mockResponse;
    }

    // Default mock response
    return {
      output: {
        message: {
          role: "assistant",
          content: [{ text: "Test response from mock provider" }],
        },
      },
      stopReason: "end_turn",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
      metrics: {
        latencyMs: 50,
      },
    };
  }

  /**
   * Mock streaming converse method.
   * Returns { stream, $metadata } matching Bedrock's ConverseStreamCommand response shape.
   * When tools are provided and no tool results exist yet in messages,
   * returns a tool_use response for the first tool. Otherwise returns end_turn.
   * @param {object} input - Bedrock-style input
   * @returns {{ stream: AsyncIterable, $metadata: object }} Bedrock-style response
   */
  async converseStream(input) {
    if (this.mockError) {
      throw this.mockError;
    }

    if (this.mockStream) {
      return { stream: this.createMockStream(this.mockStream), $metadata: {} };
    }

    // If tools are provided and no tool results exist yet, return a tool_use response
    const hasTools = input.toolConfig?.tools?.length > 0;
    const hasToolResults = input.messages?.some((m) => m.content?.some((c) => c.toolResult));

    if (hasTools && !hasToolResults) {
      const toolName = input.toolConfig.tools[0].toolSpec?.name || "search";
      const toolInput =
        toolName === "search" || toolName === "recall" ? '{"query":"mock test"}' : "{}";
      return {
        stream: this.createMockStream([
          { type: "messageStart", messageStart: { role: "assistant" } },
          {
            type: "contentBlockStart",
            contentBlockStart: {
              contentBlockIndex: 0,
              start: { toolUse: { toolUseId: "mock_tool_1", name: toolName } },
            },
          },
          {
            type: "contentBlockDelta",
            contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: toolInput } } },
          },
          { type: "contentBlockStop", contentBlockStop: { contentBlockIndex: 0 } },
          { type: "messageStop", messageStop: { stopReason: "tool_use" } },
          {
            type: "metadata",
            metadata: {
              usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
              metrics: { latencyMs: 50 },
            },
          },
        ]),
        $metadata: {},
      };
    }

    // Default: end_turn text response
    return {
      stream: this.createMockStream([
        { type: "messageStart", messageStart: { role: "assistant" } },
        {
          type: "contentBlockStart",
          contentBlockStart: { contentBlockIndex: 0, start: { text: {} } },
        },
        {
          type: "contentBlockDelta",
          contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Test " } },
        },
        {
          type: "contentBlockDelta",
          contentBlockDelta: { contentBlockIndex: 0, delta: { text: "streaming response" } },
        },
        { type: "contentBlockStop", contentBlockStop: { contentBlockIndex: 0 } },
        { type: "messageStop", messageStop: { stopReason: "end_turn" } },
        {
          type: "metadata",
          metadata: {
            usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
            metrics: { latencyMs: 100 },
          },
        },
      ]),
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

  async *createMockStream(events) {
    for (const event of events) {
      yield event;
    }
  }
}
