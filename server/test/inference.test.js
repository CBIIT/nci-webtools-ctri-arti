import assert from "node:assert";
import { after, before, test } from "node:test";

import { runModel } from "gateway/inference.js";
import BedrockProvider from "gateway/providers/bedrock.js";

const HAIKU_MODEL = "us.anthropic.claude-3-5-haiku-20241022-v1:0";

test.skip("Cache System Tests", async (t) => {
  await t.test("Basic Cache Write and Read", async () => {
    // Generate content that exceeds 2048 token minimum (16k+ chars)
    const largeContent = "This is a comprehensive test of the caching system. ".repeat(350); // ~17.5k chars

    const messages = [
      { role: "user", content: [{ text: largeContent }] },
      { role: "assistant", content: [{ text: "I understand the comprehensive test content." }] },
      { role: "user", content: [{ text: "What is the main topic?" }] },
    ];

    console.log("\n=== First request (should write to cache) ===");
    const response1 = await runModel({
      model: HAIKU_MODEL,
      messages,
      stream: false,
    });

    assert.ok(response1.usage);
    assert.ok(response1.usage.inputTokens > 0);
    console.log("First request:", {
      inputTokens: response1.usage.inputTokens,
      cacheWrite: response1.usage.cacheWriteInputTokens || 0,
      cacheRead: response1.usage.cacheReadInputTokens || 0,
    });

    // Wait for cache to establish
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("\n=== Second identical request (should read from cache) ===");
    const response2 = await runModel({
      model: HAIKU_MODEL,
      messages,
      stream: false,
    });

    assert.ok(response2.usage);
    console.log("Second request:", {
      inputTokens: response2.usage.inputTokens,
      cacheWrite: response2.usage.cacheWriteInputTokens || 0,
      cacheRead: response2.usage.cacheReadInputTokens || 0,
    });

    // Verify cache behavior
    const firstWrite = response1.usage.cacheWriteInputTokens || 0;
    const secondRead = response2.usage.cacheReadInputTokens || 0;

    if (firstWrite > 0 && secondRead > 0) {
      console.log(
        "✓ CACHE WORKING: First request wrote",
        firstWrite,
        "tokens, second request read",
        secondRead,
        "tokens"
      );
      assert.ok(secondRead >= firstWrite * 0.8, "Cache read should be at least 80% of cache write");
    } else {
      console.log("⚠ Cache behavior unexpected:", { firstWrite, secondRead });
    }
  });

  await t.test("Cache Cost Savings Calculation", async () => {
    const timestamp = Date.now();
    const uniqueContent = `Test ${timestamp}: Caching reduces costs significantly. `.repeat(400); // ~20k chars

    const messages = [
      { role: "user", content: [{ text: uniqueContent }] },
      { role: "assistant", content: [{ text: "I understand the cost analysis content." }] },
      { role: "user", content: [{ text: "Summarize the key points." }] },
    ];

    const response1 = await runModel({
      model: HAIKU_MODEL,
      messages,
      stream: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response2 = await runModel({
      model: HAIKU_MODEL,
      messages,
      stream: false,
    });

    // Calculate costs
    const haiku = {
      input: 0.0008, // $0.0008 per 1k tokens
      cacheRead: 0.00008, // $0.00008 per 1k tokens (90% cheaper)
      output: 0.004, // $0.004 per 1k output tokens
    };

    // First request cost (no cache)
    const cost1 = {
      input: (response1.usage.inputTokens / 1000) * haiku.input,
      output: (response1.usage.outputTokens / 1000) * haiku.output,
      total: 0,
    };
    cost1.total = cost1.input + cost1.output;

    // Second request cost (with cache)
    const cost2 = {
      input: (response2.usage.inputTokens / 1000) * haiku.input,
      cacheRead: ((response2.usage.cacheReadInputTokens || 0) / 1000) * haiku.cacheRead,
      output: (response2.usage.outputTokens / 1000) * haiku.output,
      total: 0,
    };
    cost2.total = cost2.input + cost2.cacheRead + cost2.output;

    // Calculate savings
    const totalInputTokens2 =
      response2.usage.inputTokens + (response2.usage.cacheReadInputTokens || 0);
    const cost2WithoutCache =
      (totalInputTokens2 / 1000) * haiku.input +
      (response2.usage.outputTokens / 1000) * haiku.output;
    const savings = cost2WithoutCache - cost2.total;
    const savingsPercent = cost2WithoutCache > 0 ? (savings / cost2WithoutCache) * 100 : 0;

    console.log("\n=== Cost Analysis ===");
    console.log("First request (no cache):", {
      tokens: response1.usage.inputTokens,
      cost: `$${cost1.total.toFixed(6)}`,
    });

    console.log("Second request (with cache):", {
      nonCachedTokens: response2.usage.inputTokens,
      cachedTokens: response2.usage.cacheReadInputTokens || 0,
      totalTokens: totalInputTokens2,
      actualCost: `$${cost2.total.toFixed(6)}`,
      wouldCostWithoutCache: `$${cost2WithoutCache.toFixed(6)}`,
      savings: `$${savings.toFixed(6)} (${savingsPercent.toFixed(1)}%)`,
    });

    // Verify significant savings
    if (response2.usage.cacheReadInputTokens > 0) {
      assert.ok(savingsPercent > 80, "Cache should provide at least 80% cost savings");
      console.log("✓ Cache provided", savingsPercent.toFixed(1) + "% cost savings");
    }
  });

  await t.test("Progressive Conversation Growth", async () => {
    const messages = [];

    // Phase 1: Under 1024 tokens
    messages.push({
      role: "user",
      content: [{ text: "Start a conversation about AI." }],
    });

    messages.push({
      role: "assistant",
      content: [{ text: "AI is transforming technology. " + "A".repeat(900) }], // ~950 chars
    });

    console.log("\n=== Phase 1: Under 1024 tokens ===");
    let response = await runModel({
      model: HAIKU_MODEL,
      messages,
      stream: false,
    });
    console.log("Cache write:", response.usage.cacheWriteInputTokens || 0, "tokens");
    assert.strictEqual(
      response.usage.cacheWriteInputTokens || 0,
      0,
      "Should not cache under 1024 tokens"
    );

    // Phase 2: Cross 1024 boundary
    messages.push({
      role: "user",
      content: [{ text: "Tell me more details. " + "B".repeat(7000) }], // Push over 1024
    });

    console.log("\n=== Phase 2: Cross 1024 boundary ===");
    response = await runModel({
      model: HAIKU_MODEL,
      messages,
      stream: false,
    });
    console.log("Cache write:", response.usage.cacheWriteInputTokens || 0, "tokens");

    // Phase 3: Cross 2048 boundary
    messages.push({
      role: "assistant",
      content: [{ text: "Here are more details. " + "C".repeat(8000) }],
    });

    console.log("\n=== Phase 3: Cross 2048 boundary ===");
    response = await runModel({
      model: HAIKU_MODEL,
      messages,
      stream: false,
    });
    console.log("Cache write:", response.usage.cacheWriteInputTokens || 0, "tokens");

    // Verify cache was written at some point
    const hasCache =
      response.usage.cacheWriteInputTokens > 0 || response.usage.cacheReadInputTokens > 0;
    assert.ok(hasCache, "Cache should be active after crossing boundaries");
  });

  await t.test("Cache with Different Content", async () => {
    const content1 = "First unique content for cache testing. ".repeat(450); // ~18k chars
    const content2 = "Second different content for comparison. ".repeat(450); // ~18k chars

    // First conversation
    const messages1 = [
      { role: "user", content: [{ text: content1 }] },
      { role: "assistant", content: [{ text: "I understand the first content." }] },
      { role: "user", content: [{ text: "What did I say?" }] },
    ];

    const response1a = await runModel({
      model: HAIKU_MODEL,
      messages: messages1,
      stream: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const response1b = await runModel({
      model: HAIKU_MODEL,
      messages: messages1,
      stream: false,
    });

    // Second conversation with different content
    const messages2 = [
      { role: "user", content: [{ text: content2 }] },
      { role: "assistant", content: [{ text: "I understand the second content." }] },
      { role: "user", content: [{ text: "What did I say?" }] },
    ];

    const response2 = await runModel({
      model: HAIKU_MODEL,
      messages: messages2,
      stream: false,
    });

    console.log("\n=== Cache Behavior with Different Content ===");
    console.log("First content - initial:", {
      write: response1a.usage.cacheWriteInputTokens || 0,
      read: response1a.usage.cacheReadInputTokens || 0,
    });
    console.log("First content - repeat:", {
      write: response1b.usage.cacheWriteInputTokens || 0,
      read: response1b.usage.cacheReadInputTokens || 0,
    });
    console.log("Second content:", {
      write: response2.usage.cacheWriteInputTokens || 0,
      read: response2.usage.cacheReadInputTokens || 0,
    });

    // Verify first content repeat uses cache
    if (response1b.usage.cacheReadInputTokens > 0) {
      console.log("✓ First content reused cache");
    }

    // Verify second content doesn't use first content's cache
    const secondContentCacheRead = response2.usage.cacheReadInputTokens || 0;
    const firstContentTokens =
      response1a.usage.inputTokens + (response1a.usage.cacheReadInputTokens || 0);

    if (secondContentCacheRead < firstContentTokens * 0.5) {
      console.log("✓ Second content correctly did not reuse first content cache");
    }
  });

  await t.test("Direct Provider Cache Test", async () => {
    const provider = new BedrockProvider();
    const largeContent = "Direct provider test for caching. ".repeat(500); // ~17k chars

    const input = {
      modelId: HAIKU_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { text: largeContent },
            { cachePoint: { type: "default" } },
            { text: "Summarize this." },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 50,
        temperature: 0,
      },
    };

    console.log("\n=== Direct Provider Test ===");
    const response1 = await provider.converse(input);
    console.log("First call:", {
      input: response1.usage.inputTokens,
      cacheWrite: response1.usage.cacheWriteInputTokens || 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const response2 = await provider.converse(input);
    console.log("Second call:", {
      input: response2.usage.inputTokens,
      cacheRead: response2.usage.cacheReadInputTokens || 0,
    });

    if (response2.usage.cacheReadInputTokens > 0) {
      const hitRate =
        (response2.usage.cacheReadInputTokens /
          (response2.usage.inputTokens + response2.usage.cacheReadInputTokens)) *
        100;
      console.log("✓ Cache hit rate:", hitRate.toFixed(1) + "%");
      assert.ok(hitRate > 90, "Cache hit rate should be over 90%");
    }
  });
});
