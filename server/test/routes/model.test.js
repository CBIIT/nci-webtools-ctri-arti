import db, { Usage } from "database";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eq, desc } from "drizzle-orm";
import express from "express";
import request from "supertest";

import api from "../../services/routes/model.js";

const TEST_MODEL = "idp.us.anthropic.claude-sonnet-4-6";
const TEST_USER_ID = 1;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: { id: TEST_USER_ID } };
    next();
  });
  app.use(api);
  return app;
}

/** Parse a newline-delimited JSON stream body into an array of objects. */
function parseNDJSON(raw) {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** Collect a streaming response into parsed lines. */
async function streamPost(app, body) {
  const res = await request(app)
    .post("/model")
    .send(body)
    .buffer(true)
    .parse((res, callback) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk.toString()));
      res.on("end", () => callback(null, data));
    });
  return { status: res.status, lines: parseNDJSON(res.body) };
}

describe("POST /model", () => {
  const app = buildApp();

  it("returns a valid non-streaming response", async () => {
    const res = await request(app)
      .post("/model")
      .send({
        model: TEST_MODEL,
        stream: false,
        messages: [{ role: "user", content: [{ text: "Say exactly: hello" }] }],
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.output, "response should have output");
    assert.equal(res.body.output.message.role, "assistant");
    assert.ok(res.body.output.message.content[0].text, "response should have text content");
    assert.ok(res.body.usage.inputTokens > 0, "should have input tokens");
    assert.ok(res.body.usage.outputTokens > 0, "should have output tokens");

    console.log("[IDP non-stream]", JSON.stringify(res.body, null, 2));
  });

  it("returns a valid streaming response", async () => {
    const { status, lines } = await streamPost(app, {
      model: TEST_MODEL,
      stream: true,
      messages: [{ role: "user", content: [{ text: "Count to 3." }] }],
    });

    assert.equal(status, 200);
    console.log("[IDP stream]", JSON.stringify(lines, null, 2));

    const contentDeltas = lines.filter((l) => l.type === "contentBlockDelta");
    assert.ok(contentDeltas.length > 0, "should have at least one contentBlockDelta");

    const metadataBlock = lines.find((l) => l.type === "metadata");
    assert.ok(metadataBlock, "should have a metadata block");
    assert.ok(metadataBlock.metadata.usage.inputTokens > 0, "should have input tokens");
    assert.ok(metadataBlock.metadata.usage.outputTokens > 0, "should have output tokens");
  });

  it("records usage rows in the database after a request", async () => {
    const before = new Date();

    await request(app)
      .post("/model")
      .send({
        model: TEST_MODEL,
        stream: false,
        messages: [{ role: "user", content: [{ text: "Say hi." }] }],
      });

    const rows = await db
      .select()
      .from(Usage)
      .where(eq(Usage.userID, TEST_USER_ID))
      .orderBy(desc(Usage.createdAt));

    const newRows = rows.filter((r) => new Date(r.createdAt) >= before);

    assert.ok(newRows.length >= 2, "should have at least input_tokens and output_tokens rows");

    const units = newRows.map((r) => r.unit);
    assert.ok(units.includes("input_tokens"), "should have input_tokens row");
    assert.ok(units.includes("output_tokens"), "should have output_tokens row");

    for (const row of newRows) {
      assert.ok(row.quantity > 0, `quantity should be > 0 for unit: ${row.unit}`);
      assert.ok(row.cost >= 0, `cost should be >= 0 for unit: ${row.unit}`);
      assert.equal(row.userID, TEST_USER_ID);
    }

    console.log("[IDP db usage rows]", newRows);
  });

  /**
   * Tool-call test.
   *
   * Sends a tool definition and a prompt that forces the model to call it.
   * Validates that the non-streaming response contains a toolUse content block
   * and that the block carries a well-formed input payload.
   */
  it("returns a tool_use content block when the model calls a tool", async () => {
    const res = await request(app)
      .post("/model")
      .send({
        model: TEST_MODEL,
        stream: false,
        messages: [
          {
            role: "user",
            content: [{ text: "What is the weather in Columbus, Ohio? Use the get_weather tool." }],
          },
        ],
        tools: [
          {
            toolSpec: {
              name: "get_weather",
              description: "Returns current weather for a given city.",
              inputSchema: {
                json: {
                  type: "object",
                  properties: {
                    city: { type: "string", description: "City name" },
                  },
                  required: ["city"],
                },
              },
            },
          },
        ],
      });

    assert.equal(res.status, 200);

    console.log("[IDP tool-call]", JSON.stringify(res.body, null, 2));

    const content = res.body.output?.message?.content ?? [];
    const toolUseBlock = content.find((b) => b.toolUse);

    assert.ok(toolUseBlock, "response content should contain a toolUse block");
    assert.ok(toolUseBlock.toolUse.toolUseId, "toolUse block should have a toolUseId");
    assert.equal(toolUseBlock.toolUse.name, "get_weather", "tool name should match");
    assert.ok(
      typeof toolUseBlock.toolUse.input === "object",
      "toolUse.input should be a parsed object"
    );
    assert.ok(toolUseBlock.toolUse.input.city, "tool input should contain city");
    assert.equal(res.body.stopReason, "tool_use", "stopReason should be tool_use");
  });

  /**
   * Reasoning / extended-thinking stream test.
   *
   * Sends `thinking: { type: "enabled", budgetTokens: 2000 }` and validates
   * that the stream emits at least one `reasoningDelta` content block before
   * the regular text blocks arrive.
   *
   * The expected Bedrock-compatible SSE shape for a reasoning block is:
   *   { type: "contentBlockStart",  contentBlockStart:  { contentBlockIndex: N, start: { reasoningContent: {} } } }
   *   { type: "contentBlockDelta",  contentBlockDelta:  { contentBlockIndex: N, delta: { reasoningContent: { text: "..." } } } }
   *   { type: "contentBlockStop",   contentBlockStop:   { contentBlockIndex: N } }
   */
  it("emits reasoning content blocks when thinking is enabled (streaming)", async () => {
    const { status, lines } = await streamPost(app, {
      model: TEST_MODEL,
      stream: true,
      thoughtBudget: 2000,
      messages: [
        {
          role: "user",
          content: [{ text: "Step by step, what is 17 × 24?" }],
        },
      ],
    });

    assert.equal(status, 200);

    console.log("[IDP reasoning stream]", JSON.stringify(lines, null, 2));

    // At least one contentBlockStart whose `start` has a `reasoningContent` key
    const reasoningStarts = lines.filter(
      (l) =>
        l.type === "contentBlockStart" && l.contentBlockStart?.start?.reasoningContent !== undefined
    );
    assert.ok(
      reasoningStarts.length > 0,
      "stream should contain at least one reasoningContent contentBlockStart"
    );

    // At least one delta carrying reasoning text
    const reasoningDeltas = lines.filter(
      (l) =>
        l.type === "contentBlockDelta" &&
        l.contentBlockDelta?.delta?.reasoningContent?.text !== undefined
    );
    assert.ok(
      reasoningDeltas.length > 0,
      "stream should contain at least one reasoningContent delta"
    );
  });

  /**
   * Attachment (image) test.
   *
   * Sends a small 1×1 red PNG encoded as base64 and asks the model to
   * describe it.  Validates that:
   *   1. The route accepts an `image` content block without erroring.
   *   2. The model's text response references visual content (i.e., the image
   *      was forwarded correctly — not silently dropped).
   */
  it("accepts an image attachment and returns a description", async () => {
    // 200x200 solid red PNG
    const TINY_RED_PNG_B64 =
      "iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAIAAAAiOjnJAAABcklEQVR42u3SMQ0AAAjAsPk3DSY4OJpUwbKm4JwEGAtjYSwwFsbCWGAsjIWxwFgYC2OBsTAWxgJjYSyMBcbCWBgLjIWxMBYYC2NhLDAWxsJYYCyMhbHAWBgLY4GxMBbGAmNhLIwFxsJYGAuMhbEwFhgLY2EsMBbGwlhgLIyFscBYGAtjgbEwFsYCY2EsjAXGwlgYC4yFsTAWGAtjYSwwFsbCWGAsjIWxwFgYC2OBBBgLY2EsMBbGwlhgLIyFscBYGAtjgbEwFsYCY2EsjAXGwlgYC4yFsTAWGAtjYSwwFsbCWGAsjIWxwFgYC2OBsTAWxgJjYSyMBcbCWBgLjIWxMBYYC2NhLDAWxsJYYCyMhbHAWBgLY4GxMBbGAmNhLIwFxsJYGAuMhbEwFhgLY2EsMBbGwlhgLIyFscBYGAtjgbEwFsbCWBJgLIyFscBYGAtjgbEwFsYCY2EsjAXGwlgYC4yFsTAWGAtjYSwwFsbCWGAs3lnRh6zWL0rapgAAAABJRU5ErkJggg==";
    const res = await request(app)
      .post("/model")
      .send({
        model: TEST_MODEL,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              {
                image: {
                  format: "png",
                  source: { bytes: TINY_RED_PNG_B64 },
                },
              },
              { text: "Describe what you see in this image in one sentence." },
            ],
          },
        ],
      });

    assert.equal(res.status, 200);

    console.log("[IDP attachment]", JSON.stringify(res.body, null, 2));

    const text = res.body.output?.message?.content
      ?.filter((b) => b.text)
      ?.map((b) => b.text)
      ?.join(" ")
      ?.toLowerCase();

    assert.ok(text, "response should contain text content");
    // The model should mention colour, pixel, image, or something visual —
    // not just generic filler — confirming the image was actually forwarded.
    const visualTerms = ["red", "color", "colour", "pixel", "image", "small", "single", "tiny"];
    const mentionsVisual = visualTerms.some((term) => text.includes(term));
    assert.ok(mentionsVisual, `response should reference visual content; got: "${text}"`);
  });

  /**
   * converseStream Bedrock-envelope shape test:
   *
   *   messageStart        — once, role = "assistant"
   *   contentBlockStart   — once per block, carries start.text / start.toolUse / etc.
   *   contentBlockDelta   — one or more per block, carries the incremental delta
   *   contentBlockStop    — once per block
   *   messageStop         — once, carries stopReason
   *   metadata            — once, carries usage + metrics
   */
  it("converseStream emits Bedrock-compatible SSE envelope blocks", async () => {
    const { status, lines } = await streamPost(app, {
      model: TEST_MODEL,
      stream: true,
      messages: [
        {
          role: "user",
          content: [{ text: "Say exactly: hi" }],
        },
      ],
    });

    assert.equal(status, 200);

    console.log("[IDP stream envelope]", JSON.stringify(lines, null, 2));

    // ── 1. messageStart ──────────────────────────────────────────────────────
    const messageStarts = lines.filter((l) => l.type === "messageStart");
    assert.equal(messageStarts.length, 1, "exactly one messageStart block");
    assert.equal(
      messageStarts[0].messageStart?.role,
      "assistant",
      "messageStart.role should be assistant"
    );

    // ── 2. contentBlockStart ─────────────────────────────────────────────────
    const blockStarts = lines.filter((l) => l.type === "contentBlockStart");
    assert.ok(blockStarts.length >= 1, "at least one contentBlockStart block");
    for (const bs of blockStarts) {
      assert.ok(
        typeof bs.contentBlockStart?.contentBlockIndex === "number",
        "contentBlockStart.contentBlockIndex should be a number"
      );
      assert.ok(
        bs.contentBlockStart?.start !== undefined,
        "contentBlockStart.start should be present"
      );
    }

    // ── 3. contentBlockDelta ─────────────────────────────────────────────────
    const blockDeltas = lines.filter((l) => l.type === "contentBlockDelta");
    assert.ok(blockDeltas.length >= 1, "at least one contentBlockDelta block");
    for (const bd of blockDeltas) {
      assert.ok(
        typeof bd.contentBlockDelta?.contentBlockIndex === "number",
        "contentBlockDelta.contentBlockIndex should be a number"
      );
      assert.ok(
        bd.contentBlockDelta?.delta !== undefined,
        "contentBlockDelta.delta should be present"
      );
    }

    // ── 4. contentBlockStop ──────────────────────────────────────────────────
    const blockStops = lines.filter((l) => l.type === "contentBlockStop");
    assert.equal(
      blockStops.length,
      blockStarts.length,
      "contentBlockStop count should match contentBlockStart count"
    );

    // ── 5. messageStop ───────────────────────────────────────────────────────
    const messageStops = lines.filter((l) => l.type === "messageStop");
    assert.equal(messageStops.length, 1, "exactly one messageStop block");
    assert.ok(messageStops[0].messageStop?.stopReason, "messageStop.stopReason should be present");

    // ── 6. metadata ──────────────────────────────────────────────────────────
    const metadataBlocks = lines.filter((l) => l.type === "metadata");
    assert.equal(metadataBlocks.length, 1, "exactly one metadata block");

    const { usage } = metadataBlocks[0].metadata ?? {};
    assert.ok(usage, "metadata should contain usage");
    assert.ok(usage.inputTokens > 0, "inputTokens should be > 0");
    assert.ok(usage.outputTokens > 0, "outputTokens should be > 0");

    // ── 7. ordering ──────────────────────────────────────────────────────────
    // messageStart must be first, metadata must be last
    assert.equal(lines[0].type, "messageStart", "first block must be messageStart");
    assert.equal(lines[lines.length - 1].type, "metadata", "last block must be metadata");

    // Every contentBlockDelta must come after its matching contentBlockStart
    for (const delta of blockDeltas) {
      const idx = delta.contentBlockDelta.contentBlockIndex;
      const startPos = lines.findIndex(
        (l) => l.type === "contentBlockStart" && l.contentBlockStart?.contentBlockIndex === idx
      );
      const deltaPos = lines.indexOf(delta);
      assert.ok(
        deltaPos > startPos,
        `contentBlockDelta[${idx}] must come after its contentBlockStart`
      );
    }
  });
});
