import dompurify from "dompurify";
import TurndownService from "turndown";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5/build/pdf.worker.min.mjs";

/**
 * Returns the text content of a document
 * @param {ArrayBuffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
export async function parseDocument(buffer, mimetype = null) {
  const filetype = detectFileType(buffer);
  const text = new TextDecoder("utf-8").decode(buffer);
  switch (filetype) {
    case "PDF":
      return await parsePdf(buffer);
    case "DOCX":
      return await parseDocx(buffer);
    case "HTML":
      return new TurndownService().turndown(
        dompurify.sanitize(text, { FORBID_TAGS: ["style", "script"] })
      );
    default:
      return text;
  }
}

/**
 * Extracts text from a DOCX buffer
 * @param {Buffer} buffer
 * @returns {Promise<string>} extracted text
 */
export async function parseDocx(arrayBuffer) {
  const rawText = await mammoth.extractRawText({ arrayBuffer });
  return rawText.value || "No text found in DOCX";
}

/**
 * Extracts text from a PDF buffer
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} extracted text
 */
async function parsePdf(data) {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
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

export function parseStreamingJson(incompleteJson) {
  // Handle empty input
  if (!incompleteJson || incompleteJson.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(incompleteJson);
  } catch (e) {
    // Continue with auto-completion logic
  }

  let str = incompleteJson;
  let inString = false;
  let escaped = false;
  const closingStack = [];

  // Process each character to track structure using a stack
  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    // Handle escape sequences within strings
    if (char === "\\" && inString) {
      escaped = !escaped;
    } else if (char === '"' && !escaped) {
      inString = !inString;
      escaped = false;
    } else {
      escaped = false;
    }

    // When not in a string, track opening and closing tokens
    if (!inString) {
      if (char === "{") {
        closingStack.push("}");
      } else if (char === "[") {
        closingStack.push("]");
      } else if (char === "}" || char === "]") {
        // If the closing token matches the expected one, pop from the stack
        if (closingStack.length && closingStack[closingStack.length - 1] === char) {
          closingStack.pop();
        }
      }
    }
  }

  // If we ended inside a string, close it
  if (inString) {
    str += '"';
  }

  // Append any missing closing characters in the correct order
  while (closingStack.length) {
    str += closingStack.pop();
  }

  // Fix incomplete key-value pairs at the end (e.g., {"key": )
  str = str.replace(/("([^"\\]*(\\.[^"\\]*)*)"\s*:\s*)$/g, "$1null");

  // Remove any trailing commas at the end or before closing braces/brackets
  str = str.replace(/,\s*$/g, "");
  str = str.replace(/,\s*([\]}])/g, "$1");

  // Try to parse the fixed JSON string
  try {
    return JSON.parse(str);
  } catch (e) {
    return incompleteJson;
  }
}

/**
 * Reads a file as text, arrayBuffer, or dataURL
 * @param {File} file - The file to read
 * @param {"text"|"dataURL"|"arrayBuffer"} [type] - The type of data to read
 * @returns {Promise<string|ArrayBuffer|string>} - The file content
 * @throws {Error} - Throws an error if the file read fails
 */
export function readFile(file, type = "text") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (error) => reject(error);
    reader.onload = () => resolve(reader.result);
    if (type === "dataURL") {
      reader.readAsDataURL(file);
    } else if (type === "arrayBuffer") {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
}

/**
 * Converts a file to base64
 * @param {File} file - The file to convert
 * @param {boolean} truncate - Whether to truncate the base64 string prefix
 * @returns {Promise<string>} - The base64 string
 */
export async function fileToBase64(file, truncate = false) {
  let dataURL = await readFile(file, "dataURL");
  if (truncate) {
    dataURL = dataURL.split(",")[1];
  }
  return dataURL;
}

/**
 * Splits a filename into name and extension
 * @param {string} filename - The filename to split
 * @returns {[string, string]} - The filename and extension
 */
export function splitFilename(filename) {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? [filename.slice(0, idx), filename.slice(idx + 1)] : [filename, ""];
}

/**
 * Detects if a file is TEXT, BINARY, PDF, ZIP, or DOCX
 * @param {ArrayBuffer} buffer - The file buffer to analyze
 * @returns {string} - 'TEXT', 'BINARY', 'PDF', 'ZIP', or 'DOCX'
 */
export function detectFileType(buffer) {
  const bytes = new Uint8Array(buffer);
  const fileStart = bytesToString(bytes, 0, 50);

  if (fileStart.startsWith("%PDF-")) {
    return "PDF";
  }

  if (fileStart.startsWith("PK\x03\x04")) {
    // Look for Content_Types.xml to identify DOCX
    const searchArea = bytesToString(bytes, 0, Math.min(bytes.length, 10000));
    if (searchArea.includes("[Content_Types].xml")) {
      return "DOCX";
    } else {
      return "ZIP";
    }
  }

  // look for <html> tags to identify HTML
  if (fileStart.toLowerCase().includes("<html")) {
    return "HTML";
  }

  return isTextFile(bytes) ? "TEXT" : "BINARY";
}

/**
 * Helper function to convert a byte array to a string
 * @param {Uint8Array} bytes - The byte array
 * @param {number} start - Starting index
 * @param {number} length - How many bytes to convert
 * @returns {string} - The resulting string
 */
function bytesToString(bytes, start, length) {
  const end = Math.min(start + length, bytes.length);
  return String.fromCharCode.apply(null, bytes.slice(start, end));
}

/**
 * Determines if content is likely a text file
 * @param {Uint8Array} bytes - The byte array to analyze
 * @returns {boolean} - True if likely a text file, false if likely binary
 */
function isTextFile(bytes) {
  const MAX_SAMPLE_SIZE = 1000;
  const sampleSize = Math.min(bytes.length, MAX_SAMPLE_SIZE);
  let binaryCount = 0;

  for (let i = 0; i < sampleSize; i++) {
    const byte = bytes[i];
    // Skip common text file control characters (CR, LF, TAB)
    if (byte === 0x0d || byte === 0x0a || byte === 0x09) {
      continue;
    }
    // Count null bytes and control characters as binary indicators
    if (byte === 0x00 || (byte < 0x20 && byte !== 0x09)) {
      binaryCount++;
    }
  }

  // If more than 10% of the sample contains binary data, consider it binary
  return binaryCount <= sampleSize * 0.1;
}
