// Test provider for mocking AI responses in tests
export default class TestProvider {
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
  async converse(input) {
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
          content: [{ text: "Test response from mock provider" }]
        }
      },
      stopReason: "end_turn",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      },
      metrics: {
        latencyMs: 50
      }
    };
  }

  /**
   * Mock streaming converse method
   * @param {object} input - Bedrock-style input
   * @returns {AsyncGenerator<object>} Bedrock-style stream events
   */
  async converseStream(input) {
    if (this.mockError) {
      throw this.mockError;
    }

    if (this.mockStream) {
      return this.createMockStream(this.mockStream);
    }

    // Default mock stream
    return this.createMockStream([
      { type: "messageStart", messageStart: { role: "assistant" } },
      { type: "contentBlockStart", contentBlockStart: { contentBlockIndex: 0, start: { text: {} } } },
      { type: "contentBlockDelta", contentBlockDelta: { contentBlockIndex: 0, delta: { text: "Test " } } },
      { type: "contentBlockDelta", contentBlockDelta: { contentBlockIndex: 0, delta: { text: "streaming response" } } },
      { type: "contentBlockStop", contentBlockStop: { contentBlockIndex: 0 } },
      { type: "messageStop", messageStop: { stopReason: "end_turn" } },
      { 
        type: "metadata", 
        metadata: { 
          usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
          metrics: { latencyMs: 100 }
        }
      }
    ]);
  }

  async *createMockStream(events) {
    for (const event of events) {
      yield event;
    }
  }
}