import { parseDocument } from "shared/parsers.js";

import { splitTextIntoSections } from "../shared/contradiction-helpers.js";

import { decodeBytes, resolveMimeType, sanitizeText } from "./review-helpers.js";

async function parseInputDocument(document, index, { defaultName, source }) {
  const name = document.name || `${defaultName}-${index + 1}`;
  const contentType = resolveMimeType(document);
  const buffer = decodeBytes(document.bytes);
  const text = sanitizeText(await parseDocument(buffer, contentType)).trim();

  return {
    source,
    name,
    contentType,
    text,
  };
}

export async function parseMergedDocumentInput(
  input,
  { textKey, textSource, singleKey, singleSource, multiKey, mergedSource, mergedName, defaultName }
) {
  const parts = [];

  if (typeof input[textKey] === "string" && input[textKey].trim()) {
    parts.push({
      source: textSource,
      name: textKey,
      contentType: "text/plain",
      text: sanitizeText(input[textKey]).trim(),
    });
  }

  if (input[singleKey]?.bytes) {
    parts.push(
      await parseInputDocument(input[singleKey], parts.length, {
        defaultName,
        source: singleSource,
      })
    );
  }

  if (Array.isArray(input[multiKey])) {
    for (let index = 0; index < input[multiKey].length; index += 1) {
      parts.push(
        await parseInputDocument(input[multiKey][index], parts.length, {
          defaultName,
          source: singleSource,
        })
      );
    }
  }

  if (parts.length === 0) {
    throw new Error(`No ${defaultName.replace(/-/g, " ")} content was available to parse.`);
  }

  const text =
    parts.length === 1
      ? parts[0].text
      : parts.map((part, index) => `FILE ${index + 1}: ${part.name}\n\n${part.text}`).join("\n\n");

  const mergedText = text.trim();

  return {
    source: parts.length === 1 ? parts[0].source : mergedSource,
    name: parts.length === 1 ? parts[0].name : mergedName,
    contentType: parts.length === 1 ? parts[0].contentType : "text/plain",
    text: mergedText,
    sections: splitTextIntoSections(mergedText),
    files: parts.map((part) => ({
      source: part.source,
      name: part.name,
      contentType: part.contentType,
      textLength: part.text.length,
    })),
  };
}
