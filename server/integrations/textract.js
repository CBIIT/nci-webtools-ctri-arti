// textract.js
import { DetectDocumentTextCommand, TextractClient } from "@aws-sdk/client-textract";
import { PDFDocument } from "pdf-lib";

const textractClient = new TextractClient();

/**
 * Process a PDF/image with AWS Textract
 * @returns {Promise<Array>} Array of Textract results, one per page
 */
export async function textract({ base64, bytes, raw = false }) {
  if (base64) {
    bytes = Buffer.from(base64, "base64");
  }
  const pages = await splitPages(bytes);
  const commands = pages.map((page) => detectDocumentText(page, raw));
  const results = await Promise.all(commands);
  return results;
}

async function splitPages(pdfBytes) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pageCount = pdfDoc.getPageCount();
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
      const pageBytes = await getPage(pdfDoc, i);
      pages.push(pageBytes);
    }
    return pages;
  } catch (_error) {
    return [pdfBytes];
  }
}

async function detectDocumentText(bytes, raw = false) {
  try {
    const command = new DetectDocumentTextCommand({ Document: { Bytes: new Uint8Array(bytes) } });
    const response = await textractClient.send(command);
    return raw ? response : response.Blocks.map((block) => block.Text || "\n").join(" ");
  } catch (error) {
    return { error: error.message || String(error) };
  }
}

async function getPage(pdfDoc, pageIndex) {
  const singlePagePdf = await PDFDocument.create();
  const [page] = await singlePagePdf.copyPages(pdfDoc, [pageIndex]);
  singlePagePdf.addPage(page);
  return await singlePagePdf.save();
}
