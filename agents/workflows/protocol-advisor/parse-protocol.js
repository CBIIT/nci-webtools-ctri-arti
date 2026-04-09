import path from "node:path";

import { parseDocument } from "shared/parsers.js";

import { sanitizeText } from "./review-helpers.js";

const MIME_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

function decodeBytes(bytes) {
  if (Buffer.isBuffer(bytes)) {
    return bytes;
  }
  if (typeof bytes === "string") {
    return Buffer.from(bytes, "base64");
  }
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes);
  }
  throw new Error("Unsupported document.bytes format");
}

function resolveMimeType(document = {}) {
  if (document.contentType) {
    return document.contentType;
  }

  const extension = path.extname(document.name || "").toLowerCase();
  return MIME_BY_EXTENSION[extension] || "text/plain";
}

async function parseInputDocument(document, index) {
  const name = document.name || `document-${index + 1}`;
  const contentType = resolveMimeType(document);
  const buffer = decodeBytes(document.bytes);
  const text = sanitizeText(await parseDocument(buffer, contentType)).trim();

  return {
    source: "document",
    name,
    contentType,
    text,
  };
}

export async function parseProtocolDocument(ctx) {
  const parts = [];

  if (typeof ctx.input.protocolText === "string" && ctx.input.protocolText.trim()) {
    parts.push({
      source: "protocolText",
      name: "protocolText",
      contentType: "text/plain",
      text: sanitizeText(ctx.input.protocolText).trim(),
    });
  }

  if (ctx.input.document?.bytes) {
    parts.push(await parseInputDocument(ctx.input.document, parts.length));
  }

  if (Array.isArray(ctx.input.documents)) {
    for (let index = 0; index < ctx.input.documents.length; index += 1) {
      parts.push(await parseInputDocument(ctx.input.documents[index], parts.length));
    }
  }

  if (parts.length === 0) {
    throw new Error("No protocol content was available to parse.");
  }

  const text =
    parts.length === 1
      ? parts[0].text
      : parts
          .map(
            (part, index) =>
              `FILE ${index + 1}: ${part.name}\n\n${part.text}`
          )
          .join("\n\n");

  return {
    source: parts.length === 1 ? parts[0].source : "documents",
    name: parts.length === 1 ? parts[0].name : "merged-protocol-documents",
    contentType: parts.length === 1 ? parts[0].contentType : "text/plain",
    text: text.trim(),
    files: parts.map((part) => ({
      source: part.source,
      name: part.name,
      contentType: part.contentType,
      textLength: part.text.length,
    })),
  };
}
