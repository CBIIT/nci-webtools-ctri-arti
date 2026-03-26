import path from "node:path";

import { parseDocument } from "shared/parsers.js";

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

export async function parseProtocolDocument(ctx) {
  if (typeof ctx.input.protocolText === "string" && ctx.input.protocolText.trim()) {
    return {
      source: "protocolText",
      contentType: "text/plain",
      text: ctx.input.protocolText.trim(),
    };
  }

  const document = ctx.input.document || {};
  const buffer = decodeBytes(document.bytes);
  const contentType = resolveMimeType(document);
  const text = await parseDocument(buffer, contentType);

  return {
    source: "document",
    name: document.name || null,
    contentType,
    text: text.trim(),
  };
}
