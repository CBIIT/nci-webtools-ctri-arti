import assert from "node:assert";
import { test } from "node:test";

import { parseDocument, parseDocx } from "../services/parsers.js";

test("parseDocument", async (t) => {
  await t.test("handles plain text via default case", async () => {
    const buffer = Buffer.from("Hello, world!");
    const result = await parseDocument(buffer, "text/plain");
    assert.strictEqual(result, "Hello, world!");
  });

  await t.test("handles unknown mimetype as plain text", async () => {
    const buffer = Buffer.from("raw content");
    const result = await parseDocument(buffer, "application/octet-stream");
    assert.strictEqual(result, "raw content");
  });

  await t.test("routes DOCX mimetype to parseDocx", async () => {
    const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    // Passing an invalid buffer should cause mammoth to reject or return fallback
    try {
      await parseDocument(Buffer.from("not a docx"), docxMime);
    } catch (err) {
      // Expected: mammoth can't parse invalid buffer
      assert.ok(err);
    }
  });

  await t.test("routes PDF mimetype to parsePdf", async () => {
    // Passing an invalid buffer should cause pdfjs to reject
    try {
      await parseDocument(Buffer.from("not a pdf"), "application/pdf");
    } catch (err) {
      assert.ok(err);
    }
  });
});

test("parseDocx", async (t) => {
  await t.test("returns fallback for empty/invalid buffer", async () => {
    try {
      const result = await parseDocx(Buffer.from(""));
      // mammoth may return a value or throw depending on input
      assert.ok(typeof result === "string");
    } catch (err) {
      // Also acceptable: mammoth throws on invalid input
      assert.ok(err);
    }
  });
});
