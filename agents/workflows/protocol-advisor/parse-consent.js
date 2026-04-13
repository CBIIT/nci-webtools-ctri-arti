import { parseDocument } from "shared/parsers.js";

import { decodeBytes, resolveMimeType, sanitizeText } from "./review-helpers.js";

async function parseInputDocument(document, index) {
  const name = document.name || `consent-document-${index + 1}`;
  const contentType = resolveMimeType(document);
  const buffer = decodeBytes(document.bytes);
  const text = sanitizeText(await parseDocument(buffer, contentType)).trim();

  return {
    source: "consentDocument",
    name,
    contentType,
    text,
  };
}

export async function parseConsentDocument(ctx) {
  const parts = [];

  if (typeof ctx.input.consentText === "string" && ctx.input.consentText.trim()) {
    parts.push({
      source: "consentText",
      name: "consentText",
      contentType: "text/plain",
      text: sanitizeText(ctx.input.consentText).trim(),
    });
  }

  if (ctx.input.consentDocument?.bytes) {
    parts.push(await parseInputDocument(ctx.input.consentDocument, parts.length));
  }

  if (Array.isArray(ctx.input.consentDocuments)) {
    for (let index = 0; index < ctx.input.consentDocuments.length; index += 1) {
      parts.push(await parseInputDocument(ctx.input.consentDocuments[index], parts.length));
    }
  }

  if (parts.length === 0) {
    throw new Error("No consent content was available to parse.");
  }

  const text =
    parts.length === 1
      ? parts[0].text
      : parts.map((part, index) => `FILE ${index + 1}: ${part.name}\n\n${part.text}`).join("\n\n");

  return {
    source: parts.length === 1 ? parts[0].source : "consentDocuments",
    name: parts.length === 1 ? parts[0].name : "merged-consent-documents",
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
