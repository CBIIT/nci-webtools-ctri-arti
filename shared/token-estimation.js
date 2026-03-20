import { getPdfPageCount, parseDocxText, parseDocument } from "./parsers.js";

const TEXTISH_DOCUMENT_FORMATS = new Set(["txt", "md", "html", "csv"]);
const DOCUMENT_MIME_TYPES = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html",
  md: "text/markdown",
  pdf: "application/pdf",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const TEXT_BYTES_PER_TOKEN = 3;
const TEXT_ATTACHMENT_FIXED_OVERHEAD = 24;
const TEXT_ATTACHMENT_MULTIPLIER = 2.25;
const TOOL_JSON_BYTES_PER_TOKEN = 1.2;
const TOOL_JSON_FIXED_OVERHEAD = 128;
const DOCX_BYTES_PER_TOKEN = 128;
const PDF_MIN_PAGE_TOKENS = 1600;
const PDF_BYTES_PER_TOKEN = 16;
const IMAGE_TILE_SIZE = 512;
const IMAGE_TILE_TOKENS = 170;
const IMAGE_FALLBACK_BYTES_PER_TOKEN = 768;

function estimateUtf8Tokens(value, bytesPerToken = TEXT_BYTES_PER_TOKEN) {
  if (!value) return 0;
  return Math.max(1, Math.ceil(Buffer.byteLength(String(value), "utf8") / bytesPerToken));
}

function estimateStructuredTokens(value, bytesPerToken = TOOL_JSON_BYTES_PER_TOKEN) {
  if (value == null) return 0;
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  return TOOL_JSON_FIXED_OVERHEAD + Math.max(1, Math.ceil(bytes / bytesPerToken));
}

function normalizeDocumentFormat(format) {
  return String(format || "").trim().toLowerCase();
}

function normalizeBytes(bytes) {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (Buffer.isBuffer(bytes)) return new Uint8Array(bytes);
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (typeof bytes === "string") {
    try {
      return Uint8Array.from(Buffer.from(bytes, "base64"));
    } catch {
      return null;
    }
  }
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  if (bytes?.type === "Buffer" && Array.isArray(bytes.data)) {
    return Uint8Array.from(bytes.data);
  }
  return null;
}

function decodeTextDocumentBytes(bytes, format) {
  if (!bytes) return "";
  if (!TEXTISH_DOCUMENT_FORMATS.has(format)) return "";

  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return Buffer.from(bytes).toString("utf8");
  }
}

function estimateTextAttachmentTokens(text) {
  if (!text) return 0;
  return TEXT_ATTACHMENT_FIXED_OVERHEAD + Math.ceil(estimateUtf8Tokens(text) * TEXT_ATTACHMENT_MULTIPLIER);
}

function estimateDocumentTextPayloadTokens(document = {}) {
  const source = document.source || {};
  let tokens = 0;

  if (source.text) {
    tokens += estimateTextAttachmentTokens(source.text);
  }

  if (Array.isArray(source.content)) {
    for (const block of source.content) {
      if (block?.text) tokens += estimateTextAttachmentTokens(block.text);
    }
  }

  return tokens;
}

function estimateDocumentBytesTokens(document = {}) {
  const format = normalizeDocumentFormat(document.format);
  const bytes = normalizeBytes(document?.source?.bytes);
  if (!bytes?.length) return 0;

  const decodedText = decodeTextDocumentBytes(bytes, format);
  if (decodedText) return estimateTextAttachmentTokens(decodedText);

  if (format === "docx") {
    return Math.max(1, Math.ceil(bytes.length / DOCX_BYTES_PER_TOKEN));
  }

  if (format === "pdf") {
    return Math.max(PDF_MIN_PAGE_TOKENS, Math.ceil(bytes.length / PDF_BYTES_PER_TOKEN));
  }

  return Math.max(1, Math.ceil(bytes.length / 64));
}

function readImageDimensions(format, bytes) {
  if (!bytes?.length) return null;
  const imageFormat = String(format || "").toLowerCase();

  if (imageFormat === "png" && bytes.length >= 24) {
    return {
      width:
        (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
      height:
        (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23],
    };
  }

  if (imageFormat === "gif" && bytes.length >= 10) {
    return {
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
    };
  }

  if (imageFormat === "jpeg" || imageFormat === "jpg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }

      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2) break;

      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3 ||
        marker === 0xc5 ||
        marker === 0xc6 ||
        marker === 0xc7 ||
        marker === 0xc9 ||
        marker === 0xca ||
        marker === 0xcb ||
        marker === 0xcd ||
        marker === 0xce ||
        marker === 0xcf
      ) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }

      offset += 2 + length;
    }
  }

  if (imageFormat === "webp" && bytes.length >= 30) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff !== "RIFF" || webp !== "WEBP") return null;

    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
  }

  return null;
}

function estimateImageBytesTokens(image = {}) {
  const bytes = normalizeBytes(image?.source?.bytes);
  if (!bytes?.length) return 0;

  const dimensions = readImageDimensions(image.format, bytes);
  if (dimensions?.width > 0 && dimensions?.height > 0) {
    const tilesX = Math.max(1, Math.ceil(dimensions.width / IMAGE_TILE_SIZE));
    const tilesY = Math.max(1, Math.ceil(dimensions.height / IMAGE_TILE_SIZE));
    return tilesX * tilesY * IMAGE_TILE_TOKENS;
  }

  return Math.max(IMAGE_TILE_TOKENS, Math.ceil(bytes.length / IMAGE_FALLBACK_BYTES_PER_TOKEN));
}

function estimateToolResultContentTokens(content = []) {
  let tokens = 0;
  for (const block of content) {
    if (block?.text) tokens += estimateUtf8Tokens(block.text);
    if (block?.json) tokens += estimateStructuredTokens(block.json);
    if (block?.document) tokens += estimateDocumentTokens(block.document);
    if (block?.image) tokens += estimateImageBytesTokens(block.image);
    if (block?.video?.source?.bytes) {
      const bytes = normalizeBytes(block.video.source.bytes);
      if (bytes?.length) tokens += Math.max(1, Math.ceil(bytes.length / 64));
    }
  }
  return tokens;
}

function estimateDocumentTokens(document = {}) {
  let tokens = estimateDocumentTextPayloadTokens(document);

  if (document?.source?.bytes) {
    tokens += estimateDocumentBytesTokens(document);
  }

  if (document.context) {
    tokens += estimateUtf8Tokens(document.context);
  }

  return tokens;
}

export function estimateContentTokens(content = {}) {
  let tokens = 0;
  if (content.text) tokens += estimateUtf8Tokens(content.text);
  if (content.document) tokens += estimateDocumentTokens(content.document);
  if (content.image) {
    tokens += estimateImageBytesTokens(content.image);
  }
  if (content.video?.source?.bytes) {
    const bytes = normalizeBytes(content.video.source.bytes);
    if (bytes?.length) tokens += Math.max(1, Math.ceil(bytes.length / 64));
  }
  if (content.toolUse) tokens += estimateStructuredTokens(content.toolUse);
  if (content.toolResult) {
    tokens += estimateStructuredTokens({
      toolUseId: content.toolResult.toolUseId,
      status: content.toolResult.status,
    });
    tokens += estimateToolResultContentTokens(content.toolResult.content);
  }
  if (content.guardContent?.text?.text) {
    tokens += estimateUtf8Tokens(content.guardContent.text.text);
  }
  if (content.guardContent?.image) {
    tokens += estimateImageBytesTokens(content.guardContent.image);
  }
  if (content.reasoningContent?.reasoningText?.text) {
    tokens += estimateUtf8Tokens(content.reasoningContent.reasoningText.text);
  }
  if (content.reasoningContent?.redactedContent) {
    const bytes = normalizeBytes(content.reasoningContent.redactedContent);
    if (bytes?.length) tokens += Math.max(1, Math.ceil(bytes.length / 64));
  }
  if (content.citationsContent) {
    tokens += estimateStructuredTokens(content.citationsContent);
  }
  return tokens;
}

export function estimateMessageTokens(messages = []) {
  let tokens = 0;
  for (const message of messages) {
    if (!message) continue;
    tokens += estimateUtf8Tokens(message.role || "user");
    for (const content of message.content || []) {
      tokens += estimateContentTokens(content);
    }
  }
  return tokens;
}

export function estimateSystemTokens(system = []) {
  let tokens = 0;
  for (const content of system || []) {
    tokens += estimateContentTokens(content);
  }
  return tokens;
}

export function estimateToolConfigTokens(toolConfig = {}) {
  let tokens = 0;
  for (const tool of toolConfig?.tools || []) {
    if (!tool) continue;
    tokens += estimateStructuredTokens(tool.toolSpec || tool);
  }
  if (toolConfig?.toolChoice) {
    tokens += estimateStructuredTokens(toolConfig.toolChoice);
  }
  return tokens;
}

export function estimateConverseTokens({
  messages = [],
  system = [],
  toolConfig,
  additionalModelRequestFields,
} = {}) {
  return (
    estimateMessageTokens(messages) +
    estimateSystemTokens(system) +
    estimateToolConfigTokens(toolConfig) +
    estimateStructuredTokens(additionalModelRequestFields)
  );
}

async function extractParsedDocumentText(document = {}) {
  const format = normalizeDocumentFormat(document.format);
  const bytes = normalizeBytes(document?.source?.bytes);
  const mimeType = DOCUMENT_MIME_TYPES[format];
  if (!bytes?.length || !mimeType || TEXTISH_DOCUMENT_FORMATS.has(format)) return "";

  try {
    if (format === "docx") {
      return await parseDocxText(Buffer.from(bytes));
    }
    return await parseDocument(Buffer.from(bytes), mimeType);
  } catch {
    return "";
  }
}

async function estimateDocumentBytesTokensAccurate(document = {}) {
  const format = normalizeDocumentFormat(document.format);
  const bytes = normalizeBytes(document?.source?.bytes);
  if (!bytes?.length) return 0;

  const decodedText = decodeTextDocumentBytes(bytes, format);
  if (decodedText) return estimateTextAttachmentTokens(decodedText);

  if (format === "docx") {
    const parsedText = await extractParsedDocumentText(document);
    if (parsedText) {
      return Math.max(estimateUtf8Tokens(parsedText), Math.ceil(bytes.length / DOCX_BYTES_PER_TOKEN));
    }
  }

  if (format === "pdf") {
    let pageCount = 1;
    try {
      pageCount = await getPdfPageCount(Buffer.from(bytes));
    } catch {
      pageCount = 1;
    }

    const parsedText = await extractParsedDocumentText(document);
    const parsedTextTokens = parsedText ? estimateUtf8Tokens(parsedText) * 3 : 0;
    return Math.max(pageCount * PDF_MIN_PAGE_TOKENS, parsedTextTokens);
  }

  return estimateDocumentBytesTokens(document);
}

export async function estimateContentTokensAccurate(content = {}) {
  let tokens = estimateContentTokens(content);
  const document = content.document;
  if (!document?.source?.bytes) return tokens;

  const accurateDocumentBytesTokens = await estimateDocumentBytesTokensAccurate(document);
  return tokens - estimateDocumentBytesTokens(document) + accurateDocumentBytesTokens;
}

export async function estimateMessageTokensAccurate(messages = []) {
  let tokens = 0;
  for (const message of messages) {
    if (!message) continue;
    tokens += estimateUtf8Tokens(message.role || "user");
    for (const content of message.content || []) {
      tokens += await estimateContentTokensAccurate(content);
    }
  }
  return tokens;
}

export function estimateEmbeddingTextTokens(text) {
  return estimateUtf8Tokens(text);
}

export { normalizeBytes };
