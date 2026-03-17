import assert from "node:assert";
import { test } from "node:test";

import {
  estimateContentTokens,
  calculateCacheBoundaries,
  addCachePointsToMessages,
  sanitizeProviderFileName,
  getProviderVisibleFileName,
  processMessages,
} from "gateway/inference.js";
import { MAX_INLINE_FILE_BYTES, validateInlineMessageContent } from "gateway/upload-limits.js";
import { PDFDocument } from "pdf-lib";

test("estimateContentTokens", async (t) => {
  await t.test("estimates text content", () => {
    const tokens = estimateContentTokens({ text: "Hello world" }); // 11 chars
    assert.strictEqual(tokens, Math.ceil(11 / 8));
  });

  await t.test("estimates document bytes", () => {
    const bytes = new Uint8Array(300);
    const tokens = estimateContentTokens({ document: { source: { bytes } } });
    assert.strictEqual(tokens, Math.ceil(300 / 3));
  });

  await t.test("estimates image bytes", () => {
    const bytes = new Uint8Array(600);
    const tokens = estimateContentTokens({ image: { source: { bytes } } });
    assert.strictEqual(tokens, Math.ceil(600 / 3));
  });

  await t.test("estimates toolUse content", () => {
    const toolUse = { toolUseId: "123", name: "search", input: { q: "test" } };
    const tokens = estimateContentTokens({ toolUse });
    assert.strictEqual(tokens, Math.ceil(JSON.stringify(toolUse).length / 8));
  });

  await t.test("estimates toolResult content", () => {
    const toolResult = { toolUseId: "123", content: [{ text: "result" }] };
    const tokens = estimateContentTokens({ toolResult });
    assert.strictEqual(tokens, Math.ceil(JSON.stringify(toolResult).length / 8));
  });

  await t.test("handles mixed content (text + toolUse)", () => {
    const toolUse = { toolUseId: "1", name: "test", input: {} };
    const tokens = estimateContentTokens({ text: "hello", toolUse });
    const expectedText = Math.ceil(5 / 8);
    const expectedTool = Math.ceil(JSON.stringify(toolUse).length / 8);
    assert.strictEqual(tokens, expectedText + expectedTool);
  });

  await t.test("returns 0 for empty content", () => {
    assert.strictEqual(estimateContentTokens({}), 0);
  });
});

test("calculateCacheBoundaries", async (t) => {
  await t.test("returns an array", () => {
    const boundaries = calculateCacheBoundaries();
    assert.ok(Array.isArray(boundaries));
    assert.ok(boundaries.length > 0);
  });

  await t.test("starts at 1024", () => {
    const boundaries = calculateCacheBoundaries();
    assert.strictEqual(boundaries[0], 1024);
  });

  await t.test("uses sqrt(2) scaling", () => {
    const boundaries = calculateCacheBoundaries();
    // Second boundary should be ~1024 * sqrt(2) ≈ 1448
    const expected = Math.round(1024 * Math.sqrt(2));
    assert.strictEqual(boundaries[1], expected);
  });

  await t.test("respects maxTokens parameter", () => {
    const boundaries = calculateCacheBoundaries(2000);
    assert.ok(boundaries.every((b) => b <= 2000));
    assert.ok(boundaries.length > 0);
  });

  await t.test("boundaries are monotonically increasing", () => {
    const boundaries = calculateCacheBoundaries();
    for (let i = 1; i < boundaries.length; i++) {
      assert.ok(boundaries[i] > boundaries[i - 1]);
    }
  });
});

test("addCachePointsToMessages", async (t) => {
  await t.test("no-op when hasCache is false", () => {
    const messages = [{ role: "user", content: [{ text: "hello" }] }];
    const result = addCachePointsToMessages(messages, false);
    assert.deepStrictEqual(result, messages);
  });

  await t.test("no-op with empty messages", () => {
    const result = addCachePointsToMessages([], true);
    assert.deepStrictEqual(result, []);
  });

  await t.test("no-op with null/undefined messages", () => {
    assert.strictEqual(addCachePointsToMessages(null, true), null);
    assert.strictEqual(addCachePointsToMessages(undefined, true), undefined);
  });

  await t.test("adds cache points at boundaries for large content", () => {
    // Create messages with enough tokens to cross the 1024 boundary
    const largeText = "x".repeat(1024 * 8); // ~1024 tokens
    const messages = [
      { role: "user", content: [{ text: largeText }] },
      { role: "assistant", content: [{ text: "ok" }] },
      { role: "user", content: [{ text: "more" }] },
    ];
    const result = addCachePointsToMessages(messages, true);
    // At least one message should have a cache point added
    const hasCachePoint = result.some((m) => m.content.some((c) => c.cachePoint));
    assert.ok(hasCachePoint, "Should have at least one cache point");
  });

  await t.test("limits to 2 cache points", () => {
    // Create messages with enough tokens to cross multiple boundaries
    const largeText = "x".repeat(2048 * 8); // ~2048 tokens per message
    const messages = [];
    for (let i = 0; i < 10; i++) {
      messages.push({ role: i % 2 === 0 ? "user" : "assistant", content: [{ text: largeText }] });
    }
    const result = addCachePointsToMessages(messages, true);
    const cachePointCount = result.reduce(
      (count, m) => count + m.content.filter((c) => c.cachePoint).length,
      0
    );
    assert.ok(cachePointCount <= 2, `Expected at most 2 cache points, got ${cachePointCount}`);
  });

  await t.test("does not add cache points when content is below boundary", () => {
    const messages = [{ role: "user", content: [{ text: "short" }] }];
    const result = addCachePointsToMessages(messages, true);
    const hasCachePoint = result.some((m) => m.content.some((c) => c.cachePoint));
    assert.ok(!hasCachePoint, "Should not add cache points for small content");
  });
});

test("provider filename sanitization", async (t) => {
  await t.test("sanitizes names only for provider payloads", () => {
    assert.strictEqual(sanitizeProviderFileName("book/md.md"), "book md md");
    assert.strictEqual(sanitizeProviderFileName(" report  final?.pdf "), "report final pdf");
  });

  await t.test("derives the provider-visible name from originalName", () => {
    assert.strictEqual(
      getProviderVisibleFileName({ name: "document", originalName: "book.md", format: "md" }),
      "book"
    );
    assert.strictEqual(
      getProviderVisibleFileName({
        name: "upload 173",
        originalName: "report_final.v2.pdf",
        format: "pdf",
      }),
      "report-final v2"
    );
  });

  await t.test(
    "processMessages preserves originalName and shows the model the real filename",
    () => {
      const messages = [
        {
          role: "user",
          content: [
            {
              document: {
                name: "document",
                originalName: "book.md",
                format: "md",
                source: { bytes: "YQ==" },
              },
            },
          ],
        },
      ];

      const [processed] = processMessages(messages, 0);
      const file = processed.content[0].document;
      assert.strictEqual(file.name, "book");
      assert.strictEqual(file.originalName, "book.md");
      assert.ok(file.source.bytes instanceof Uint8Array, "bytes should be converted for provider");
    }
  );
});

test("processMessages", async (t) => {
  await t.test("preserves message roles while normalizing provider content", () => {
    const messages = [
      {
        role: "user",
        content: [
          { text: "Search for test" },
          { toolUse: { toolUseId: "tu_1", name: "search", input: "{}" } },
        ],
      },
      {
        role: "assistant",
        content: [
          { toolResult: { toolUseId: "tu_1", content: [{ json: { ok: true } }] } },
          { text: "Done" },
        ],
      },
    ];

    const result = processMessages(structuredClone(messages), 0);

    assert.deepStrictEqual(
      result.map((message) => ({
        role: message.role,
        content: message.content.map((content) =>
          content.text
            ? { text: content.text }
            : content.toolUse
              ? { toolUse: content.toolUse }
              : { toolResult: content.toolResult }
        ),
      })),
      [
        {
          role: "user",
          content: [
            { text: "Search for test" },
            { toolUse: { toolUseId: "tu_1", name: "search", input: { text: "{}" } } },
          ],
        },
        {
          role: "assistant",
          content: [
            { toolResult: { toolUseId: "tu_1", content: [{ json: { ok: true } }] } },
            { text: "Done" },
          ],
        },
      ]
    );
  });
});

test("inline upload limits", async (t) => {
  await t.test("rejects more than five inline files in one message", async () => {
    const content = Array.from({ length: 6 }, (_, index) => ({
      document: {
        name: `doc-${index + 1}`,
        originalName: `doc-${index + 1}.txt`,
        format: "txt",
        source: { bytes: Buffer.from("hello", "utf-8").toString("base64") },
      },
    }));

    await assert.rejects(() => validateInlineMessageContent(content), /maximum of 5 inline files/i);
  });

  await t.test("rejects inline files larger than 4.5 MB", async () => {
    const content = [
      {
        document: {
          name: "large",
          originalName: "large.txt",
          format: "txt",
          source: { bytes: Buffer.alloc(MAX_INLINE_FILE_BYTES + 1).toString("base64") },
        },
      },
    ];

    await assert.rejects(() => validateInlineMessageContent(content), /4\.5 MB limit/i);
  });

  await t.test("rejects inline PDFs with more than 100 pages", async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 101; i++) {
      pdf.addPage([200, 200]);
    }

    const content = [
      {
        document: {
          name: "protocol",
          originalName: "protocol.pdf",
          format: "pdf",
          source: { bytes: Buffer.from(await pdf.save()).toString("base64") },
        },
      },
    ];

    await assert.rejects(() => validateInlineMessageContent(content), /maximum of 100 PDF pages/i);
  });
});
