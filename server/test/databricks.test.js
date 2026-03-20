import assert from "node:assert/strict";
import { test } from "node:test";

import DatabricksProvider from "../../gateway/providers/databricks.js";

function createJsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function createSseResponse(events, { status = 200 } = {}) {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${event}\n\n`).join("");
  return {
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
    async text() {
      return payload;
    },
  };
}

test("DatabricksProvider maps Bedrock requests and responses through chat completions", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });

    if (String(url).includes("oauth2/v2.0/token")) {
      return createJsonResponse({ access_token: "token-123", expires_in: 3600 });
    }

    const body = JSON.parse(options.body);
    assert.equal(url, "https://workspace.example.com/serving-endpoints/chat/completions");
    assert.equal(body.model, "databricks-claude-sonnet-4-6");
    assert.equal(body.messages[0].role, "system");
    assert.deepStrictEqual(body.messages[0].content[0].cache_control, { type: "ephemeral" });
    assert.equal(body.messages[1].content[0].type, "text");
    assert.equal(body.messages[1].content[1].type, "document");
    assert.equal(body.messages[1].content[1].source.type, "base64");
    assert.equal(body.messages[1].content[2].type, "image_url");
    assert.equal(body.messages[2].tool_calls[0].function.name, "lookup");
    assert.equal(body.messages[3].role, "tool");
    assert.deepStrictEqual(body.tools[0].cache_control, { type: "ephemeral" });
    assert.deepStrictEqual(body.tool_choice, {
      type: "function",
      function: { name: "lookup" },
    });
    assert.deepStrictEqual(body.thinking, { type: "enabled", budget_tokens: 2048 });
    assert.deepStrictEqual(body.anthropic_beta, ["context-1m-2025-08-07"]);

    return createJsonResponse({
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: [
              {
                type: "reasoning",
                summary: [{ type: "summary_text", text: "Checking references", signature: "sig-1" }],
              },
              { type: "text", text: "Looking that up now." },
            ],
            tool_calls: [
              {
                id: "call_1",
                function: {
                  name: "lookup",
                  arguments: '{"q":"Paris"}',
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 6,
        total_tokens: 18,
      },
    });
  };

  try {
    const provider = new DatabricksProvider({
      apiKey: JSON.stringify({
        tenantId: "tenant-id",
        clientId: "client-id",
        clientSecret: "client-secret",
        databricksHost: "https://workspace.example.com",
      }),
    });

    const result = await provider.converse({
      modelId: "idp.us.anthropic.claude-sonnet-4-6",
      system: [{ text: "Use the provided context." }, { cachePoint: { type: "default" } }],
      messages: [
        {
          role: "user",
          content: [
            { text: "Summarize this file and image." },
            {
              document: {
                name: "notes",
                format: "txt",
                source: { bytes: Uint8Array.from(Buffer.from("alpha beta gamma")) },
              },
            },
            {
              image: {
                format: "png",
                source: { bytes: Uint8Array.from([0, 1, 2, 3]) },
              },
            },
          ],
        },
        {
          role: "assistant",
          content: [
            { text: "I should call the lookup tool." },
            { toolUse: { toolUseId: "tool_1", name: "lookup", input: { q: "Paris" } } },
          ],
        },
        {
          role: "user",
          content: [{ toolResult: { toolUseId: "tool_1", content: [{ json: { city: "Paris" } }] } }],
        },
      ],
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: "lookup",
              description: "Look up a city.",
              inputSchema: { json: { type: "object", properties: { q: { type: "string" } } } },
            },
          },
          { cachePoint: { type: "default" } },
        ],
        toolChoice: { tool: { name: "lookup" } },
      },
      inferenceConfig: {
        maxTokens: 99,
        temperature: 0.2,
        topP: 0.7,
        stopSequences: ["DONE"],
      },
      additionalModelRequestFields: {
        thinking: { type: "enabled", budget_tokens: 2048 },
        anthropic_beta: ["context-1m-2025-08-07"],
      },
    });

    assert.equal(requests.length, 2);
    assert.equal(result.stopReason, "tool_use");
    assert.deepStrictEqual(result.usage, {
      inputTokens: 11,
      outputTokens: 7,
      cacheReadInputTokens: 5,
      cacheWriteInputTokens: 6,
      totalTokens: 18,
    });
    assert.deepStrictEqual(result.output.message.content, [
      {
        reasoningContent: {
          reasoningText: { text: "Checking references", signature: "sig-1" },
        },
      },
      { text: "Looking that up now." },
      {
        toolUse: {
          toolUseId: "call_1",
          name: "lookup",
          input: { q: "Paris" },
        },
      },
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("DatabricksProvider keeps token caches per provider instance", async () => {
  const originalFetch = global.fetch;
  const authHeaders = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("oauth2/v2.0/token")) {
      const params = new URLSearchParams(String(options.body));
      return createJsonResponse({
        access_token: `token-for-${params.get("client_id")}`,
        expires_in: 3600,
      });
    }

    authHeaders.push(options.headers.Authorization);
    return createJsonResponse({
      choices: [{ finish_reason: "stop", message: { content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
  };

  try {
    const providerA = new DatabricksProvider({
      apiKey: JSON.stringify({
        tenantId: "tenant-a",
        clientId: "client-a",
        clientSecret: "secret-a",
        databricksHost: "https://workspace.example.com",
      }),
    });
    const providerB = new DatabricksProvider({
      apiKey: JSON.stringify({
        tenantId: "tenant-b",
        clientId: "client-b",
        clientSecret: "secret-b",
        databricksHost: "https://workspace.example.com",
      }),
    });

    await providerA.converse({
      modelId: "databricks-claude-sonnet-4-6",
      messages: [{ role: "user", content: [{ text: "hello" }] }],
    });
    await providerB.converse({
      modelId: "databricks-claude-opus-4-6",
      messages: [{ role: "user", content: [{ text: "hello" }] }],
    });

    assert.deepStrictEqual(authHeaders, [
      "Bearer token-for-client-a",
      "Bearer token-for-client-b",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("DatabricksProvider fails fast on invalid provider config JSON", () => {
  assert.throws(
    () => new DatabricksProvider({ apiKey: "not-json" }),
    /Databricks provider apiKey is not valid JSON/
  );
});

test("DatabricksProvider retries transient stream capacity failures", async () => {
  const originalFetch = global.fetch;
  const originalMaxRetries = process.env.DATABRICKS_MAX_RETRIES;
  const originalRetryBaseDelayMs = process.env.DATABRICKS_RETRY_BASE_DELAY_MS;
  let completionAttempts = 0;

  process.env.DATABRICKS_MAX_RETRIES = "2";
  process.env.DATABRICKS_RETRY_BASE_DELAY_MS = "0";

  global.fetch = async (url) => {
    if (String(url).includes("oauth2/v2.0/token")) {
      return createJsonResponse({ access_token: "token-123", expires_in: 3600 });
    }

    completionAttempts += 1;
    if (completionAttempts < 3) {
      return createJsonResponse(
        {
          error_code: "TEMPORARILY_UNAVAILABLE",
          message: "capacity constrained",
        },
        { status: 503 }
      );
    }

    return createSseResponse([
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_retry",
                  function: { name: "lookup", arguments: '{"q":"Paris"}' },
                },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [{ finish_reason: "tool_calls" }],
        usage: {
          prompt_tokens: 13,
          completion_tokens: 4,
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 3,
          total_tokens: 17,
        },
      }),
      "[DONE]",
    ]);
  };

  try {
    const provider = new DatabricksProvider({
      apiKey: JSON.stringify({
        tenantId: "tenant-id",
        clientId: "client-id",
        clientSecret: "client-secret",
        databricksHost: "https://workspace.example.com",
      }),
    });

    const response = await provider.converseStream({
      modelId: "databricks-claude-sonnet-4-6",
      system: [{ text: "Use tools when required." }, { cachePoint: { type: "default" } }],
      messages: [{ role: "user", content: [{ text: "Call the lookup tool." }] }],
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: "lookup",
              description: "Look up a city.",
              inputSchema: { json: { type: "object", properties: { q: { type: "string" } } } },
            },
          },
          { cachePoint: { type: "default" } },
        ],
      },
    });

    const events = [];
    for await (const event of response.stream) {
      events.push(event);
    }

    assert.equal(completionAttempts, 3);
    assert.deepStrictEqual(
      events.find((event) => event.type === "contentBlockStart")?.contentBlockStart?.start,
      {
        toolUse: { toolUseId: "call_retry", name: "lookup" },
      }
    );
    assert.deepStrictEqual(events.at(-1).metadata.usage, {
      inputTokens: 13,
      outputTokens: 4,
      cacheReadInputTokens: 2,
      cacheWriteInputTokens: 3,
      totalTokens: 17,
    });
  } finally {
    global.fetch = originalFetch;
    if (originalMaxRetries === undefined) delete process.env.DATABRICKS_MAX_RETRIES;
    else process.env.DATABRICKS_MAX_RETRIES = originalMaxRetries;
    if (originalRetryBaseDelayMs === undefined) delete process.env.DATABRICKS_RETRY_BASE_DELAY_MS;
    else process.env.DATABRICKS_RETRY_BASE_DELAY_MS = originalRetryBaseDelayMs;
  }
});

test("DatabricksProvider converts reasoning and text streams into Bedrock events", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2/v2.0/token")) {
      return createJsonResponse({ access_token: "token-123", expires_in: 3600 });
    }

    return createSseResponse([
      JSON.stringify({
        choices: [
          {
            delta: {
              content: [
                {
                  type: "reasoning",
                  summary: [{ type: "summary_text", text: "First think" }],
                },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              content: "Final answer.",
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [{ finish_reason: "stop" }],
        usage: { prompt_tokens: 9, completion_tokens: 4 },
      }),
      "[DONE]",
    ]);
  };

  try {
    const provider = new DatabricksProvider({
      apiKey: JSON.stringify({
        tenantId: "tenant-id",
        clientId: "client-id",
        clientSecret: "client-secret",
        databricksHost: "https://workspace.example.com",
      }),
    });

    const response = await provider.converseStream({
      modelId: "databricks-claude-sonnet-4-6",
      messages: [{ role: "user", content: [{ text: "What is 2 + 2?" }] }],
    });

    const events = [];
    for await (const event of response.stream) {
      events.push(event);
    }

    assert.equal(events[0].type, "messageStart");
    assert.equal(events[1].type, "contentBlockStart");
    assert.deepStrictEqual(events[1].contentBlockStart.start, { reasoningContent: {} });
    assert.equal(events[2].contentBlockDelta.delta.reasoningContent.text, "First think");
    assert.equal(events[3].type, "contentBlockStop");
    assert.equal(events[4].type, "contentBlockStart");
    assert.deepStrictEqual(events[4].contentBlockStart.start, { text: {} });
    assert.equal(events[5].contentBlockDelta.delta.text, "Final answer.");
    assert.equal(events[6].type, "contentBlockStop");
    assert.deepStrictEqual(events[7], {
      type: "messageStop",
      messageStop: { stopReason: "end_turn" },
    });
    assert.deepStrictEqual(events[8].metadata.usage, {
      inputTokens: 9,
      outputTokens: 4,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("DatabricksProvider emits a controlled error event for malformed stream chunks", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2/v2.0/token")) {
      return createJsonResponse({ access_token: "token-123", expires_in: 3600 });
    }

    return createSseResponse(["{not-json}"]);
  };

  try {
    const provider = new DatabricksProvider({
      apiKey: JSON.stringify({
        tenantId: "tenant-id",
        clientId: "client-id",
        clientSecret: "client-secret",
        databricksHost: "https://workspace.example.com",
      }),
    });

    const response = await provider.converseStream({
      modelId: "databricks-claude-sonnet-4-6",
      messages: [{ role: "user", content: [{ text: "hello" }] }],
    });

    const events = [];
    for await (const event of response.stream) {
      events.push(event);
    }

    assert.equal(events[0].type, "messageStart");
    assert.equal(events[1].type, "error");
    assert.match(events[1].error.internalServerError.message, /Databricks stream error/);
    assert.equal(events.at(-1).type, "metadata");
  } finally {
    global.fetch = originalFetch;
  }
});

test("DatabricksProvider preserves incremental tool-call argument chunks in streams", async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("oauth2/v2.0/token")) {
      return createJsonResponse({ access_token: "token-123", expires_in: 3600 });
    }

    return createSseResponse([
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_42",
                  function: { name: "lookup", arguments: "{" },
                },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '"q":"Paris"}' },
                },
              ],
            },
          },
        ],
      }),
      JSON.stringify({
        choices: [{ finish_reason: "tool_calls" }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }),
      "[DONE]",
    ]);
  };

  try {
    const provider = new DatabricksProvider({
      apiKey: JSON.stringify({
        tenantId: "tenant-id",
        clientId: "client-id",
        clientSecret: "client-secret",
        databricksHost: "https://workspace.example.com",
      }),
    });

    const response = await provider.converseStream({
      modelId: "databricks-claude-opus-4-6",
      messages: [{ role: "user", content: [{ text: "Use the lookup tool." }] }],
    });

    const events = [];
    for await (const event of response.stream) {
      events.push(event);
    }

    const toolStart = events.find((event) => event.type === "contentBlockStart");
    const toolDeltas = events.filter((event) => event.type === "contentBlockDelta");
    const combinedInput = toolDeltas
      .map((event) => event.contentBlockDelta.delta.toolUse.input)
      .join("");

    assert.deepStrictEqual(toolStart.contentBlockStart.start, {
      toolUse: { toolUseId: "call_42", name: "lookup" },
    });
    assert.equal(combinedInput, '{"q":"Paris"}');
    assert.deepStrictEqual(events.at(-2), {
      type: "messageStop",
      messageStop: { stopReason: "tool_use" },
    });
  } finally {
    global.fetch = originalFetch;
  }
});
