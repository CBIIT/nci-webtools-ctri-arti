import { convertToHtml as loadDocx } from "mammoth";
import { getDocument as loadPdf } from "pdfjs-dist/legacy/build/pdf.mjs";

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
 * Extracts text from a PDF buffer
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} extracted text
 */
async function parsePdf(buffer) {
  const pdf = await loadPdf(buffer).promise;
  const pagesText = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    pagesText.push(`Page ${pageNumber}: ${pageText}`);
  }
  const content = pagesText.join("\n\n")?.trim();
  return content || "No text found in PDF";
}
