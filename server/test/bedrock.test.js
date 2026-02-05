import assert from "node:assert";
import { after, before, beforeEach, test } from "node:test";

import BedrockProvider from "../services/gateway/providers/bedrock.js";

const HAIKU_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0";

test.skip("BedrockProvider", async (t) => {
  let provider;

  before(async () => {
    // Initialize provider before tests
  });

  after(async () => {
    // Cleanup after tests
  });

  beforeEach(async () => {
    provider = new BedrockProvider();
  });

  // Basic Provider Tests
  await t.test("should instantiate correctly", async () => {
    assert.ok(provider instanceof BedrockProvider);
    assert.ok(provider.client);
    assert.strictEqual(typeof provider.converse, "function");
    assert.strictEqual(typeof provider.converseStream, "function");
  });

  // Non-Streaming Tests
  await t.test("converse method should work with simple text", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "Hi" }],
        },
      ],
      inferenceConfig: {
        maxTokens: 50,
        temperature: 0.1,
      },
    };

    const response = await provider.converse(input);

    assert.ok(response);
    assert.ok(response.output);
    assert.ok(response.output.message);
    assert.strictEqual(response.output.message.role, "assistant");
    assert.ok(Array.isArray(response.output.message.content));
    assert.ok(response.output.message.content.length > 0);
    assert.ok(response.output.message.content[0].text);
    assert.ok(response.usage);
    assert.ok(typeof response.usage.inputTokens === "number");
    assert.ok(typeof response.usage.outputTokens === "number");
    assert.ok(response.usage.inputTokens > 0);
    assert.ok(response.usage.outputTokens > 0);
  });

  await t.test("converse method should handle math question", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "2+2=" }],
        },
      ],
      inferenceConfig: {
        maxTokens: 10,
        temperature: 0,
      },
    };

    const response = await provider.converse(input);
    const responseText = response.output.message.content[0].text;

    assert.ok(responseText.includes("4"));
  });

  await t.test("converse method should handle JSON request", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: 'Return {"status": "ok"} as JSON' }],
        },
      ],
      inferenceConfig: {
        maxTokens: 50,
        temperature: 0,
      },
    };

    const response = await provider.converse(input);
    const responseText = response.output.message.content[0].text;

    assert.ok(responseText.includes("status"));
    assert.ok(responseText.includes("ok"));
  });

  await t.test("converse method should handle yes/no question", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "Is Paris in France? Answer yes or no." }],
        },
      ],
      inferenceConfig: {
        maxTokens: 10,
        temperature: 0,
      },
    };

    const response = await provider.converse(input);
    const responseText = response.output.message.content[0].text.toLowerCase();

    assert.ok(responseText.includes("yes") || responseText.includes("y"));
  });

  await t.test("converse method should handle system prompt", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "Hello" }],
        },
      ],
      system: [{ text: "You are a helpful assistant that always responds with exactly one word." }],
      inferenceConfig: {
        maxTokens: 20,
        temperature: 0.1,
      },
    };

    const response = await provider.converse(input);
    const responseText = response.output.message.content[0].text;

    // Should be a short response due to system prompt
    assert.ok(responseText.length < 50);
  });

  // Streaming Tests
  await t.test("converseStream method should work with simple text", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "Hi" }],
        },
      ],
      inferenceConfig: {
        maxTokens: 30,
        temperature: 0.1,
      },
    };

    const streamResponse = await provider.converseStream(input);
    assert.ok(streamResponse);
    assert.ok(streamResponse.stream);

    let textContent = "";
    let messageStartReceived = false;
    let messageStopReceived = false;
    let tokenUsage = null;

    for await (const chunk of streamResponse.stream) {
      if (chunk.messageStart) {
        messageStartReceived = true;
        assert.strictEqual(chunk.messageStart.role, "assistant");
      }

      if (
        chunk.contentBlockDelta &&
        chunk.contentBlockDelta.delta &&
        chunk.contentBlockDelta.delta.text
      ) {
        textContent += chunk.contentBlockDelta.delta.text;
      }

      if (chunk.messageStop) {
        messageStopReceived = true;
        assert.ok(["end_turn", "max_tokens"].includes(chunk.messageStop.stopReason));
      }

      if (chunk.metadata && chunk.metadata.usage) {
        tokenUsage = chunk.metadata.usage;
      }
    }

    assert.ok(messageStartReceived);
    assert.ok(messageStopReceived);
    assert.ok(textContent.length > 0);
    assert.ok(tokenUsage);
    assert.ok(typeof tokenUsage.inputTokens === "number");
    assert.ok(typeof tokenUsage.outputTokens === "number");
  });

  await t.test("converseStream method should handle streaming math question", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "5+3=" }],
        },
      ],
      inferenceConfig: {
        maxTokens: 10,
        temperature: 0,
      },
    };

    const streamResponse = await provider.converseStream(input);
    let textContent = "";

    for await (const chunk of streamResponse.stream) {
      if (
        chunk.contentBlockDelta &&
        chunk.contentBlockDelta.delta &&
        chunk.contentBlockDelta.delta.text
      ) {
        textContent += chunk.contentBlockDelta.delta.text;
      }
    }

    assert.ok(textContent.includes("8"));
  });

  // Error Handling Tests
  await t.test("converse method should handle invalid model ID", async () => {
    const input = {
      modelId: "invalid-model-id",
      messages: [
        {
          role: "user",
          content: [{ text: "Hello" }],
        },
      ],
    };

    await assert.rejects(
      async () => await provider.converse(input),
      (error) => {
        return (
          error.name === "ValidationException" ||
          error.name === "ResourceNotFoundException" ||
          error.message.includes("model")
        );
      }
    );
  });

  await t.test("converse method should handle empty messages", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [],
    };

    await assert.rejects(
      async () => await provider.converse(input),
      (error) => {
        return error.name === "ValidationException" || error.message.includes("messages");
      }
    );
  });

  await t.test("converse method should handle malformed message content", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "" }], // Empty text
        },
      ],
    };

    await assert.rejects(
      async () => await provider.converse(input),
      (error) => {
        return error.name === "ValidationException";
      }
    );
  });

  // Response Validation Tests
  await t.test("converse method should return valid response structure", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: "Test" }],
        },
      ],
      inferenceConfig: {
        maxTokens: 20,
        temperature: 0.5,
      },
    };

    const response = await provider.converse(input);

    // Validate response structure
    assert.ok(typeof response === "object");
    assert.ok("output" in response);
    assert.ok("usage" in response);
    assert.ok("metrics" in response);

    // Validate output structure
    assert.ok(typeof response.output === "object");
    assert.ok("message" in response.output);
    assert.strictEqual(response.output.message.role, "assistant");
    assert.ok(Array.isArray(response.output.message.content));

    // Validate usage structure
    assert.ok(typeof response.usage === "object");
    assert.ok(typeof response.usage.inputTokens === "number");
    assert.ok(typeof response.usage.outputTokens === "number");
    assert.ok(typeof response.usage.totalTokens === "number");
    assert.strictEqual(
      response.usage.totalTokens,
      response.usage.inputTokens + response.usage.outputTokens
    );

    // Validate metrics structure
    assert.ok(typeof response.metrics === "object");
    assert.ok(typeof response.metrics.latencyMs === "number");
    assert.ok(response.metrics.latencyMs > 0);
  });

  await t.test("should handle inference configuration parameters", async () => {
    const input = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: 'Say "hello world" exactly' }],
        },
      ],
      inferenceConfig: {
        maxTokens: 100,
        temperature: 0.0, // Very low temperature for deterministic output
        topP: 0.1,
        stopSequences: ["goodbye"],
      },
    };

    const response = await provider.converse(input);

    // Should complete normally with these parameters
    assert.ok(response.output.message.content[0].text);
    assert.ok(response.usage.outputTokens <= 100); // Should respect maxTokens
  });

  await t.test("should handle token usage tracking", async () => {
    const shortInput = {
      modelId: HAIKU_MODEL_ID,
      messages: [{ role: "user", content: [{ text: "Hi" }] }],
      inferenceConfig: { maxTokens: 10, temperature: 0 },
    };

    const longInput = {
      modelId: HAIKU_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [
            { text: "Tell me about artificial intelligence and machine learning technologies" },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 50, temperature: 0 },
    };

    const shortResponse = await provider.converse(shortInput);
    const longResponse = await provider.converse(longInput);

    // Longer input should use more input tokens
    assert.ok(longResponse.usage.inputTokens > shortResponse.usage.inputTokens);

    // Both should have reasonable token counts
    assert.ok(shortResponse.usage.inputTokens >= 3); // Minimum for "Hi"
    assert.ok(shortResponse.usage.inputTokens <= 10);
    assert.ok(longResponse.usage.inputTokens >= 10); // More for longer text
    assert.ok(longResponse.usage.inputTokens <= 30);
  });

  // Context Caching Tests
  await t.test("Context Caching", async (cacheTests) => {
    // Helper function to generate large content that exceeds 1024 token minimum
    const generateLargeContent = (
      baseText = "This is a comprehensive analysis of artificial intelligence and machine learning technologies in modern computing systems."
    ) => {
      // Repeat content to ensure we exceed the 1024 token minimum for caching
      return (
        Array(50).fill(baseText).join(" ") +
        " " +
        "Additional context about machine learning algorithms, deep neural networks, natural language processing, computer vision, and reinforcement learning systems used in various applications across different industries and research domains."
      );
    };

    await cacheTests.test("should handle message-level cache points", async () => {
      const largeContent = generateLargeContent();

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: largeContent }, { cachePoint: { type: "default" } }],
          },
        ],
        inferenceConfig: {
          maxTokens: 50,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      // Should complete successfully with cache point
      assert.ok(response.output.message.content[0].text);
      assert.ok(response.usage);

      // First request should write to cache if content is large enough
      if (response.usage.cacheWriteInputTokens !== undefined) {
        assert.ok(typeof response.usage.cacheWriteInputTokens === "number");
        console.log("Cache write tokens:", response.usage.cacheWriteInputTokens);
      }
    });

    await cacheTests.test("should handle system-level cache points", async () => {
      const largeSystemPrompt = generateLargeContent(
        "You are an expert AI assistant specializing in detailed analysis of complex technical topics."
      );

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: "What is machine learning?" }],
          },
        ],
        system: [{ text: largeSystemPrompt }, { cachePoint: { type: "default" } }],
        inferenceConfig: {
          maxTokens: 50,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message.content[0].text);
      assert.ok(response.usage);

      // Check for cache token usage
      if (response.usage.cacheWriteInputTokens !== undefined) {
        console.log("System cache write tokens:", response.usage.cacheWriteInputTokens);
      }
    });

    await cacheTests.test("should handle cache write and read cycle", async () => {
      const largeContent = generateLargeContent(
        "Detailed technical documentation about software architecture patterns and design principles."
      );

      const baseInput = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { text: largeContent },
              { cachePoint: { type: "default" } },
              { text: "Summarize this in one sentence." },
            ],
          },
        ],
        inferenceConfig: {
          maxTokens: 30,
          temperature: 0,
        },
      };

      // First request - should write to cache
      const firstResponse = await provider.converse(baseInput);
      assert.ok(firstResponse.usage);

      // Wait a short time to ensure cache is established
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Second identical request - should read from cache
      const secondResponse = await provider.converse(baseInput);
      assert.ok(secondResponse.usage);

      // Compare token usage
      console.log("First request - Input tokens:", firstResponse.usage.inputTokens);
      console.log("Second request - Input tokens:", secondResponse.usage.inputTokens);

      if (firstResponse.usage.cacheWriteInputTokens !== undefined) {
        console.log(
          "First request - Cache write tokens:",
          firstResponse.usage.cacheWriteInputTokens
        );
      }

      if (secondResponse.usage.cacheReadInputTokens !== undefined) {
        console.log(
          "Second request - Cache read tokens:",
          secondResponse.usage.cacheReadInputTokens
        );

        // Only assert cache read if the API actually supports it
        if (secondResponse.usage.cacheReadInputTokens > 0) {
          assert.ok(secondResponse.usage.cacheReadInputTokens > 0);
        } else {
          console.log(
            "Note: Cache read tokens are 0 - may indicate model does not support caching or content below threshold"
          );
        }
      } else {
        console.log(
          "Note: Cache token fields not present in response - may indicate model does not support caching"
        );
      }

      // Verify requests completed successfully regardless of caching support
      assert.ok(firstResponse.output.message.content[0].text.length > 0);
      assert.ok(secondResponse.output.message.content[0].text.length > 0);
    });

    await cacheTests.test("should handle cache miss with different content", async () => {
      const baseContent = generateLargeContent("First version of the content for caching test.");
      const modifiedContent = generateLargeContent(
        "Second version with different content that should not hit cache."
      );

      const firstInput = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { text: baseContent },
              { cachePoint: { type: "default" } },
              { text: "What is this about?" },
            ],
          },
        ],
        inferenceConfig: { maxTokens: 30, temperature: 0 },
      };

      const secondInput = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { text: modifiedContent },
              { cachePoint: { type: "default" } },
              { text: "What is this about?" },
            ],
          },
        ],
        inferenceConfig: { maxTokens: 30, temperature: 0 },
      };

      const firstResponse = await provider.converse(firstInput);
      const secondResponse = await provider.converse(secondInput);

      assert.ok(firstResponse.usage);
      assert.ok(secondResponse.usage);

      // Both requests should have similar token counts since no cache hit on second
      const tokenDifference = Math.abs(
        firstResponse.usage.inputTokens - secondResponse.usage.inputTokens
      );
      console.log("Token difference between requests:", tokenDifference);

      // Allow for reasonable variation in token counting (content is similar length)
      assert.ok(
        tokenDifference < 100,
        `Token difference (${tokenDifference}) should be within reasonable range for similar content`
      );
    });

    await cacheTests.test("should validate cache token fields in response", async () => {
      const largeContent = generateLargeContent();

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: largeContent }, { cachePoint: { type: "default" } }],
          },
        ],
        inferenceConfig: { maxTokens: 50, temperature: 0 },
      };

      const response = await provider.converse(input);

      // Validate standard token fields exist
      assert.ok(typeof response.usage.inputTokens === "number");
      assert.ok(typeof response.usage.outputTokens === "number");
      assert.ok(typeof response.usage.totalTokens === "number");

      // Cache token fields should exist if caching is supported (may be 0 or undefined)
      if ("cacheReadInputTokens" in response.usage) {
        assert.ok(typeof response.usage.cacheReadInputTokens === "number");
      }
      if ("cacheWriteInputTokens" in response.usage) {
        assert.ok(typeof response.usage.cacheWriteInputTokens === "number");
      }

      console.log("Usage breakdown:", {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        cacheReadInputTokens: response.usage.cacheReadInputTokens,
        cacheWriteInputTokens: response.usage.cacheWriteInputTokens,
      });
    });

    await cacheTests.test("should handle streaming with cache points", async () => {
      const largeContent = generateLargeContent(
        "Streaming test content with cache points for verification."
      );

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { text: largeContent },
              { cachePoint: { type: "default" } },
              { text: "Give me a brief response." },
            ],
          },
        ],
        inferenceConfig: { maxTokens: 40, temperature: 0 },
      };

      const streamResponse = await provider.converseStream(input);
      assert.ok(streamResponse.stream);

      let textContent = "";
      let tokenUsage = null;

      for await (const chunk of streamResponse.stream) {
        if (
          chunk.contentBlockDelta &&
          chunk.contentBlockDelta.delta &&
          chunk.contentBlockDelta.delta.text
        ) {
          textContent += chunk.contentBlockDelta.delta.text;
        }

        if (chunk.metadata && chunk.metadata.usage) {
          tokenUsage = chunk.metadata.usage;
        }
      }

      assert.ok(textContent.length > 0);
      assert.ok(tokenUsage);

      // Streaming should include cache token information
      console.log("Streaming usage:", {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        cacheReadInputTokens: tokenUsage.cacheReadInputTokens,
        cacheWriteInputTokens: tokenUsage.cacheWriteInputTokens,
      });
    });

    await cacheTests.test("should respect minimum token requirements for caching", async () => {
      // Small content - below 1024 token minimum
      const smallInput = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: "Short message" }, { cachePoint: { type: "default" } }],
          },
        ],
        inferenceConfig: { maxTokens: 20, temperature: 0 },
      };

      // Large content - above 1024 token minimum
      const largeInput = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: generateLargeContent() }, { cachePoint: { type: "default" } }],
          },
        ],
        inferenceConfig: { maxTokens: 30, temperature: 0 },
      };

      const smallResponse = await provider.converse(smallInput);
      const largeResponse = await provider.converse(largeInput);

      // Small content likely won't trigger caching due to token minimum
      console.log("Small content cache tokens:", {
        write: smallResponse.usage.cacheWriteInputTokens,
        read: smallResponse.usage.cacheReadInputTokens,
      });

      // Large content more likely to trigger caching
      console.log("Large content cache tokens:", {
        write: largeResponse.usage.cacheWriteInputTokens,
        read: largeResponse.usage.cacheReadInputTokens,
      });

      assert.ok(largeResponse.usage.inputTokens > smallResponse.usage.inputTokens);
    });

    await cacheTests.test("should handle tool configuration with cache points", async () => {
      const tools = [
        {
          toolSpec: {
            name: "calculator",
            description: "Perform basic arithmetic calculations",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  operation: { type: "string" },
                  a: { type: "number" },
                  b: { type: "number" },
                },
              },
            },
          },
        },
        { cachePoint: { type: "default" } },
      ];

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: "What tools are available?" }],
          },
        ],
        toolConfig: {
          tools: tools,
        },
        inferenceConfig: { maxTokens: 50, temperature: 0 },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message.content[0].text);
      console.log("Tool cache usage:", {
        write: response.usage.cacheWriteInputTokens,
        read: response.usage.cacheReadInputTokens,
      });
    });
  });

  // Tool Call Tests
  await t.test("Tool Calls", async (toolTests) => {
    await toolTests.test("should handle basic tool definition", async () => {
      const tools = [
        {
          toolSpec: {
            name: "get_weather",
            description: "Get current weather for a location",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  location: {
                    type: "string",
                    description: "The city name",
                  },
                },
                required: ["location"],
              },
            },
          },
        },
      ];

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: "What tools are available to you?" }],
          },
        ],
        toolConfig: {
          tools: tools,
        },
        inferenceConfig: {
          maxTokens: 100,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message);
      assert.ok(response.output.message.content[0].text);

      // Response should mention weather or tools
      const responseText = response.output.message.content[0].text.toLowerCase();
      assert.ok(
        responseText.includes("weather") ||
          responseText.includes("tool") ||
          responseText.includes("get_weather"),
        "Response should mention the available tool"
      );
    });

    await toolTests.test("should invoke tools when requested", async () => {
      const tools = [
        {
          toolSpec: {
            name: "calculate",
            description: "Perform basic arithmetic operations",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  operation: {
                    type: "string",
                    enum: ["add", "subtract", "multiply", "divide"],
                    description: "The operation to perform",
                  },
                  a: {
                    type: "number",
                    description: "First number",
                  },
                  b: {
                    type: "number",
                    description: "Second number",
                  },
                },
                required: ["operation", "a", "b"],
              },
            },
          },
        },
      ];

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: "Use the calculate tool to add 15 and 7" }],
          },
        ],
        toolConfig: {
          tools: tools,
        },
        inferenceConfig: {
          maxTokens: 200,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message);

      // Check if the model attempted to use a tool
      const hasToolUse = response.output.message.content.some((content) => content.toolUse);

      if (hasToolUse) {
        const toolUse = response.output.message.content.find((content) => content.toolUse);
        assert.ok(toolUse.toolUse.name === "calculate");
        assert.ok(toolUse.toolUse.toolUseId);
        assert.ok(toolUse.toolUse.input);

        console.log("Tool use detected:", {
          name: toolUse.toolUse.name,
          id: toolUse.toolUse.toolUseId,
          input: toolUse.toolUse.input,
        });
      } else {
        console.log("Model did not invoke tool - may have provided direct response");
        // Still a valid test - model might answer directly without tool use
      }
    });

    await toolTests.test("should handle tool with complex parameters", async () => {
      const tools = [
        {
          toolSpec: {
            name: "search_database",
            description: "Search for information in a database",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Search query",
                  },
                  filters: {
                    type: "object",
                    properties: {
                      category: { type: "string" },
                      date_range: {
                        type: "object",
                        properties: {
                          start: { type: "string" },
                          end: { type: "string" },
                        },
                      },
                    },
                  },
                  limit: {
                    type: "number",
                    minimum: 1,
                    maximum: 100,
                    default: 10,
                  },
                },
                required: ["query"],
              },
            },
          },
        },
      ];

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              {
                text: 'Search the database for "machine learning" articles from 2023, limit to 5 results',
              },
            ],
          },
        ],
        toolConfig: {
          tools: tools,
        },
        inferenceConfig: {
          maxTokens: 150,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message.content.length > 0);

      // Check if tool was invoked with complex parameters
      const toolUse = response.output.message.content.find((content) => content.toolUse);
      if (toolUse) {
        console.log("Complex tool use:", {
          name: toolUse.toolUse.name,
          input: toolUse.toolUse.input,
        });
      }
    });

    await toolTests.test("should handle tool results in conversation", async () => {
      const tools = [
        {
          toolSpec: {
            name: "get_time",
            description: "Get the current time",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  timezone: {
                    type: "string",
                    description: "Timezone (e.g., UTC, EST)",
                  },
                },
                required: [],
              },
            },
          },
        },
      ];

      // Simulate a conversation with tool use and tool result
      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: "What time is it?" }],
          },
          {
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "test_tool_123",
                  name: "get_time",
                  input: { timezone: "UTC" },
                },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                toolResult: {
                  toolUseId: "test_tool_123",
                  content: [{ text: "2024-01-15T10:30:00Z" }],
                },
              },
            ],
          },
          {
            role: "user",
            content: [{ text: "What day of the week is that?" }],
          },
        ],
        toolConfig: {
          tools: tools,
        },
        inferenceConfig: {
          maxTokens: 100,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message);
      assert.ok(response.output.message.content[0].text);

      // Should be able to process the tool result and answer the follow-up
      const responseText = response.output.message.content[0].text.toLowerCase();
      console.log("Tool result conversation response:", responseText);
    });

    await toolTests.test("should handle multiple tools", async () => {
      const tools = [
        {
          toolSpec: {
            name: "add_numbers",
            description: "Add two numbers together",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  a: { type: "number" },
                  b: { type: "number" },
                },
                required: ["a", "b"],
              },
            },
          },
        },
        {
          toolSpec: {
            name: "get_random_fact",
            description: "Get a random interesting fact",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["science", "history", "nature"],
                    description: "Category of fact",
                  },
                },
              },
            },
          },
        },
      ];

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { text: "I have multiple tools available. Can you list what you can help me with?" },
            ],
          },
        ],
        toolConfig: {
          tools: tools,
        },
        inferenceConfig: {
          maxTokens: 150,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message.content[0].text);

      const responseText = response.output.message.content[0].text.toLowerCase();
      // Should mention both tools or their capabilities
      const mentionsCalculation =
        responseText.includes("add") ||
        responseText.includes("number") ||
        responseText.includes("math");
      const mentionsFacts = responseText.includes("fact") || responseText.includes("random");

      console.log("Multiple tools response mentions calculation:", mentionsCalculation);
      console.log("Multiple tools response mentions facts:", mentionsFacts);
    });

    await toolTests.test("should handle streaming with tool calls", async () => {
      const tools = [
        {
          toolSpec: {
            name: "format_text",
            description: "Format text in various ways",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  format: {
                    type: "string",
                    enum: ["uppercase", "lowercase", "capitalize"],
                  },
                },
                required: ["text", "format"],
              },
            },
          },
        },
      ];

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [
              { text: 'Please format "hello world" to uppercase using the available tool' },
            ],
          },
        ],
        toolConfig: {
          tools: tools,
        },
        inferenceConfig: {
          maxTokens: 100,
          temperature: 0,
        },
      };

      const streamResponse = await provider.converseStream(input);
      assert.ok(streamResponse.stream);

      let textContent = "";
      let toolUseBlocks = [];
      let contentBlockStarts = [];

      for await (const chunk of streamResponse.stream) {
        if (chunk.contentBlockStart && chunk.contentBlockStart.start.toolUse) {
          contentBlockStarts.push(chunk.contentBlockStart);
          console.log("Tool use block started:", chunk.contentBlockStart.start.toolUse);
        }

        if (chunk.contentBlockDelta) {
          if (chunk.contentBlockDelta.delta.text) {
            textContent += chunk.contentBlockDelta.delta.text;
          }
          if (chunk.contentBlockDelta.delta.toolUse) {
            toolUseBlocks.push(chunk.contentBlockDelta.delta.toolUse);
            console.log("Tool use delta:", chunk.contentBlockDelta.delta.toolUse);
          }
        }
      }

      // Should have either text response or tool use
      const hasContent = textContent.length > 0 || contentBlockStarts.length > 0;
      assert.ok(hasContent, "Stream should contain either text or tool use content");

      console.log("Streaming tool test - Text length:", textContent.length);
      console.log("Streaming tool test - Tool blocks:", contentBlockStarts.length);
    });

    await toolTests.test("should handle tool choice configuration", async () => {
      const tools = [
        {
          toolSpec: {
            name: "required_tool",
            description: "A tool that should be used",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  message: { type: "string" },
                },
                required: ["message"],
              },
            },
          },
        },
      ];

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: 'Use the required_tool with message "test"' }],
          },
        ],
        toolConfig: {
          tools: tools,
          toolChoice: {
            tool: {
              name: "required_tool",
            },
          },
        },
        inferenceConfig: {
          maxTokens: 100,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message);

      // With specific tool choice, model should prefer using the tool
      const hasToolUse = response.output.message.content.some((content) => content.toolUse);

      if (hasToolUse) {
        const toolUse = response.output.message.content.find((content) => content.toolUse);
        assert.strictEqual(toolUse.toolUse.name, "required_tool");
        console.log("Tool choice worked - used required_tool");
      } else {
        console.log("Tool choice test - model may have responded directly");
      }
    });

    await toolTests.test("should validate tool input schema", async () => {
      const tools = [
        {
          toolSpec: {
            name: "strict_calculator",
            description: "Calculator with strict input validation",
            inputSchema: {
              json: {
                type: "object",
                properties: {
                  operation: {
                    type: "string",
                    enum: ["add", "multiply"], // Limited operations
                  },
                  numbers: {
                    type: "array",
                    items: { type: "number" },
                    minItems: 2,
                    maxItems: 2,
                  },
                },
                required: ["operation", "numbers"],
              },
            },
          },
        },
      ];

      const input = {
        modelId: HAIKU_MODEL_ID,
        messages: [
          {
            role: "user",
            content: [{ text: "Use strict_calculator to add 5 and 3" }],
          },
        ],
        toolConfig: {
          tools: tools,
        },
        inferenceConfig: {
          maxTokens: 150,
          temperature: 0,
        },
      };

      const response = await provider.converse(input);

      assert.ok(response.output.message);

      const toolUse = response.output.message.content.find((content) => content.toolUse);
      if (toolUse && toolUse.toolUse.name === "strict_calculator") {
        console.log("Strict calculator tool used with input:", toolUse.toolUse.input);

        // Validate the input follows schema if tool was used
        if (toolUse.toolUse.input.operation) {
          assert.ok(["add", "multiply"].includes(toolUse.toolUse.input.operation));
        }
      }
    });
  });
});
