import { convertToHtml as loadDocx, extractRawText as loadDocxText } from "mammoth";
import { getDocument as loadPdf } from "pdfjs-dist/legacy/build/pdf.mjs";

function toPdfData(buffer) {
  if (Buffer.isBuffer(buffer)) return new Uint8Array(buffer);
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  return new Uint8Array(buffer.buffer, buffer.byteOffset || 0, buffer.byteLength || 0);
}

/**
 * Retrieves and parses a document from a URL
 * @param {string} url
 * @returns {Promise<string>} extracted text
 */
export async function parseUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("Content-Type");
  return parseDocument(buffer, contentType);
}

/**
 * Returns the text content of a document
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
export async function parseDocument(buffer, mimetype) {
  switch (mimetype.toLowerCase()) {
    case "application/pdf":
      return await parsePdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return await parseDocx(buffer);
    default:
      return buffer.toString("utf-8");
  }
}

/**
 * Extracts text from a DOCX buffer
 * @param {Buffer} buffer
 * @returns {Promise<string>} extracted text
 */
export async function parseDocx(buffer) {
  const contents = await loadDocx({ buffer });
  return contents?.value || "No text found in DOCX";
}

/**
 * Extracts raw text from a DOCX buffer.
 * @param {Buffer} buffer
 * @returns {Promise<string>} extracted text
 */
export async function parseDocxText(buffer) {
  const contents = await loadDocxText({ buffer });
  return contents?.value || "No text found in DOCX";
}

function extractPageLines(items) {
  const lines = [];
  let currentLine = "";
  let lastY = null;

  for (const item of items) {
    const y = item.transform[5];

    if (lastY !== null && Math.abs(y - lastY) > 2) {
      lines.push(currentLine.trim());
      currentLine = "";
    }

    currentLine += item.str;
    lastY = y;

    if (item.hasEOL) {
      lines.push(currentLine.trim());
      currentLine = "";
      lastY = null;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.filter(Boolean);
}

/**
 * Extracts text from a PDF buffer
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} extracted text
 */
export async function parsePdf(buffer) {
  const pdf = await loadPdf({ data: toPdfData(buffer) }).promise;
  const pagesText = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pagesText.push(extractPageLines(textContent.items).join("\n"));
  }
  const content = pagesText.join("\n\n")?.trim();
  return content || "No text found in PDF";
}

/**
 * Returns the page count for a PDF buffer.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<number>}
 */
export async function getPdfPageCount(buffer) {
  const pdf = await loadPdf({ data: toPdfData(buffer) }).promise;
  return pdf.numPages;
}
