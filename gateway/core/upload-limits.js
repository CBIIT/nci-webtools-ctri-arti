import { getPdfPageCount } from "shared/parsers.js";

export const MAX_INLINE_FILE_COUNT = 5;
export const MAX_INLINE_FILE_BYTES = Math.floor(4.5 * 1024 * 1024);
export const MAX_INLINE_PDF_PAGES = 100;

function getInlineFile(content) {
  return content?.document || content?.image || null;
}

function getInlineFileName(file) {
  return String(file?.originalName || file?.name || "uploaded file");
}

export function toInlineFileBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (typeof bytes === "string") return Buffer.from(bytes, "base64");
  if (bytes?.type === "Buffer" && Array.isArray(bytes.data)) return Buffer.from(bytes.data);
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  return Buffer.from(bytes || []);
}

export async function getInlineFileError(file, rawBytes) {
  const name = getInlineFileName(file);
  if (rawBytes.length > MAX_INLINE_FILE_BYTES) {
    return `Inline file "${name}" exceeds the 4.5 MB limit and must be uploaded as a resource instead.`;
  }

  if (String(file?.format || "").toLowerCase() === "pdf") {
    const pageCount = Number(file?.pageCount);
    const pages = Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null;

    if (pages !== null) {
      if (pages > MAX_INLINE_PDF_PAGES) {
        return `Inline PDF "${name}" has ${pages} pages. A maximum of ${MAX_INLINE_PDF_PAGES} PDF pages may be provided inline; upload it as a resource instead.`;
      }
    } else {
      try {
        const parsedPages = await getPdfPageCount(rawBytes);
        if (parsedPages > MAX_INLINE_PDF_PAGES) {
          return `Inline PDF "${name}" has ${parsedPages} pages. A maximum of ${MAX_INLINE_PDF_PAGES} PDF pages may be provided inline; upload it as a resource instead.`;
        }
      } catch {
        // Let downstream parsing/provider validation handle malformed PDFs.
      }
    }
  }

  return null;
}

export async function validateInlineMessageContent(content = []) {
  let inlineFileCount = 0;

  for (const block of content) {
    const file = getInlineFile(block);
    if (!file?.source?.bytes) continue;

    inlineFileCount += 1;
    if (inlineFileCount > MAX_INLINE_FILE_COUNT) {
      throw new Error(
        `A maximum of ${MAX_INLINE_FILE_COUNT} inline files may be provided in a single message. Upload additional files as resources instead.`
      );
    }

    const error = await getInlineFileError(file, toInlineFileBuffer(file.source.bytes));
    if (error) throw new Error(error);
  }
}

export async function validateInlineMessages(messages = []) {
  for (const message of messages || []) {
    await validateInlineMessageContent(message?.content || []);
  }
}

