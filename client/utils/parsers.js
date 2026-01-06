import dompurify from "dompurify";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import TurndownService from "turndown";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5/build/pdf.worker.min.mjs";

/**
 * Returns the text content of a document
 * @param {ArrayBuffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
export async function parseDocument(buffer, _mimetype = null) {
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
  } catch (_e) {
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
  } catch (_e) {
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

/**
 * Safely parse a JSON string into an object. Optionally assert the type of the parsed object.
 *
 * @param unsafeJson The JSON string to parse.
 * @param fallback The value to return if the JSON string is invalid.
 * @returns The parsed JSON object or the fallback value if the JSON string is invalid.
 */
export function safeParseJson(unsafeJson, fallback = {}) {
  try {
    const result = JSON.parse(unsafeJson);
    if (result === null || result === undefined) {
      return fallback;
    }
    return result;
  } catch {
    return fallback;
  }
}


/**
 * Parse streaming or incomplete JSON strings into JavaScript objects.
 * @param {string} input
 * @returns {any}
 */
export function parseJSON(input) {
  if (typeof input !== "string") {
    return input;
  }
  const jsonString = input.trim();
  if (jsonString === "") {
    return null;
  }
  let index = 0;
  const LITERALS = {
    true: true,
    false: false,
    null: null,
    NaN: NaN,
    Infinity: Infinity,
    "-Infinity": -Infinity,
  };
  function skipWhitespace() {
    while (index < jsonString.length && " \n\r\t".includes(jsonString[index])) {
      index++;
    }
  }
  function parseValue() {
    skipWhitespace();
    if (index >= jsonString.length) {
      throw new Error("Unexpected end of input");
    }
    const char = jsonString[index];
    if (char === "{") return parseObject();
    if (char === "[") return parseArray();
    if (char === '"') return parseString();
    const remainingText = jsonString.substring(index);
    for (const [key, value] of Object.entries(LITERALS)) {
      if (jsonString.startsWith(key, index)) {
        const endPos = index + key.length;
        if (endPos === jsonString.length || ",]} \n\r\t".includes(jsonString[endPos])) {
          index = endPos;
          return value;
        }
      }
      if (key.startsWith(remainingText)) {
        index = jsonString.length;
        return value;
      }
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      return parseNumber();
    }
    throw new Error(`Unexpected token '${char}' at position ${index} `);
  }
  function parseArray() {
    index++;
    const arr = [];
    while (index < jsonString.length && jsonString[index] !== "]") {
      try {
        arr.push(parseValue());
        skipWhitespace();
        if (jsonString[index] === ",") {
          index++;
        } else if (jsonString[index] !== "]") {
          break;
        }
      } catch (e) {
        return arr;
      }
    }
    if (index < jsonString.length && jsonString[index] === "]") {
      index++;
    }
    return arr;
  }
  function parseObject() {
    index++; // Skip '{'
    const obj = {};
    while (index < jsonString.length && jsonString[index] !== "}") {
      try {
        skipWhitespace();
        if (jsonString[index] !== '"') break;
        const key = parseString();
        skipWhitespace();
        if (index >= jsonString.length || jsonString[index] !== ":") break;
        index++;
        obj[key] = parseValue();
        skipWhitespace();
        if (jsonString[index] === ",") {
          index++;
        } else if (jsonString[index] !== "}") {
          break;
        }
      } catch (e) {
        return obj;
      }
    }
    if (index < jsonString.length && jsonString[index] === "}") {
      index++; // Skip '}'
    }
    return obj;
  }
  function parseString() {
    if (jsonString[index] !== '"') {
      throw new Error("Expected '\"' to start a string");
    }
    const startIndex = index;
    index++; // Skip opening quote
    let escape = false;
    while (index < jsonString.length) {
      if (jsonString[index] === '"' && !escape) {
        const fullString = jsonString.substring(startIndex, ++index);
        return JSON.parse(fullString);
      }
      escape = jsonString[index] === "\\" ? !escape : false;
      index++;
    }
    const partialStr = jsonString.substring(startIndex);
    try {
      return JSON.parse(partialStr + '"');
    } catch (e) {
      const lastBackslash = partialStr.lastIndexOf("\\");
      if (lastBackslash > 0) {
        return JSON.parse(partialStr.substring(0, lastBackslash) + '"');
      }
      return partialStr.substring(1);
    }
  }
  function parseNumber() {
    const startIndex = index;
    const numberChars = "0123456789eE.+-";
    while (index < jsonString.length && numberChars.includes(jsonString[index])) {
      index++;
    }
    const numStr = jsonString.substring(startIndex, index);
    if (!numStr) throw new Error("Empty number literal");
    try {
      return parseFloat(numStr);
    } catch (e) {
      if (numStr.length > 1) {
        return parseFloat(numStr.slice(0, -1));
      }
      throw e;
    }
  }
  const result = parseValue();
  skipWhitespace();
  if (index < jsonString.length) {
    console.warn(`Extra data found at position ${index}: "${jsonString.substring(index)}"`);
  }
  return result;
}
