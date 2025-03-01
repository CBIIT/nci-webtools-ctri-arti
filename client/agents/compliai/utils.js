import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { Readability } from "@mozilla/readability";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import mammoth from "mammoth";
import TurndownService from "turndown";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

/**
 * Runs JSON tools with the given input and returns the results. Each tool is a function that takes a JSON input and returns a JSON output.
 * @param {any} toolUse - The tool use object
 * @param {any} tools - The tools object with tool names as keys and functions as values.
 * @returns {Promise<any>} - The tool output
 */
export async function runTool(toolUse, tools = { search, browse, code }) {
  let { toolUseId, name, input } = toolUse;
  console.log("Running tool:", name, input);
  try {
    const results = await tools?.[name]?.(input);
    const content = [{ json: { results } }];
    console.log("Tool output:", content);
    return { toolUseId, content };
  } catch (error) {
    console.error("Tool error:", error);
    const errorText = error.stack || error.message || String(error);
    const content = [{ text: `Error running ${name}: ${errorText}` }];
    return { toolUseId, content };
  }
}

/**
 * Reads a fetch response body as an async generator of chunks
 * @param {Response} response - The fetch Response object to read
 * @yields {Uint8Array} Binary chunks from the response stream
 * @returns {AsyncGenerator<Uint8Array>} An async generator yielding binary chunks
 */
export async function* readStream(response) {
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fetches content through a proxy
 * @param {string} url - The URL to fetch
 * @param {object} requestInit - Fetch options
 * @returns {Promise<object|string>} - JSON or text response
 */
async function fetchProxy(url, requestInit = {}) {
  const response = await fetch("/api/proxy?" + new URLSearchParams({ url }), requestInit);

  if (!response.ok) {
    throw new Error(`Proxy fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.json().catch(() => response.text());
}

/**
 * Searches usa.gov for the given query
 * @param {string} query - The search term
 * @param {number} maxResults - Maximum results to return (default 100)
 * @returns {Promise<Array>} - Array of search results
 */
export async function search({ query, maxResults = 100 }) {
  const allResults = [];
  const params = { affiliate: "usagov_all_gov", format: "json", query };
  let page = 1;
  let data;

  do {
    data = await fetchProxy("https://find.search.gov/search?" + new URLSearchParams({ ...params, page: page++ }));
    if (data?.results?.length) {
      allResults.push(...data.results);
    } else {
      break;
    }
  } while (allResults.length < Math.min(data.total, maxResults));

  return allResults.slice(0, maxResults);
}

/**
 * Returns the content of a website as text
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function browse({ url }) {
  const response = await fetch("/api/proxy?" + new URLSearchParams({ url }));
  const bytes = await response.arrayBuffer();
  if (!response.ok) {
    const text = new TextDecoder("utf-8").decode(bytes);
    return `Failed to read ${url}: ${response.status} ${response.statusText}\n${text}`;
  }
  const mimetype = response.headers.get("content-type");
  return await parseDocument(bytes, mimetype, url);
}

/**
 * Runs JavaScript code in a sandboxed environment
 * @param {string} source - Code to execute
 * @param {number} [timeout=5000] - Timeout in ms
 * @returns {Promise<string>} - Console output or error
 */
export async function code({ source, timeout = 5000 }) {
  const worker = new Worker(
    URL.createObjectURL(
      new Blob(
        [
          `
    self.onmessage = e => {
      let output = "";
      self.console.log = (...args) => output += args.join(' ') + '\\n';
      try {
        new Function(e.data)();
        self.postMessage(output || "");
      } catch (err) {
        self.postMessage(String(err));
      }
    };
  `,
        ],
        { type: "application/javascript" }
      )
    )
  );

  return new Promise((resolve) => {
    const tid = setTimeout(() => {
      worker.terminate();
      resolve("Timeout");
    }, timeout);

    worker.onmessage = (e) => {
      clearTimeout(tid);
      worker.terminate();
      resolve(e.data);
    };

    worker.onerror = (event) => {
      clearTimeout(tid);
      worker.terminate();
      resolve(`Error: ${event.message}`);
    };

    worker.postMessage(source);
  });
}

/**
 * Returns the text content of a document
 * @param {ArrayBuffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
export async function parseDocument(buffer) {
  const filetype = detectFileType(buffer);
  switch (filetype) {
    case "PDF":
      return await parsePdf(buffer);
    case "DOCX":
      return await parseDocx(buffer);
  }
  return toMarkdown(new TextDecoder("utf-8").decode(buffer));
}

/**
 * Converts HTML to Markdown
 * @param {string} htmlString - The HTML content
 * @returns {string} - The markdown content
 */
export function toMarkdown(htmlString) {
  const turndownService = new TurndownService();

  // Remove style and script tags
  turndownService.addRule("remove", {
    filter: ["style", "script"],
    replacement: () => "",
  });

  // Parse HTML into a DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");

  // Process links - make same-domain links relative
  const links = doc.querySelectorAll("a");
  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (!href) return; // Skip links without href

    try {
      const url = new URL(href, window.location.origin);
      if (url.hostname === location.hostname) {
        link.setAttribute("href", href.replace(/^https?:\/\/[^/]+/, ""));
      }
    } catch (error) {
      // Invalid URL, leave it as is
    }
  });

  // Extract content using Readability
  try {
    const article = new Readability(doc).parse();
    if (!article) {
      throw new Error("Could not extract article content.");
    }

    // Convert to markdown
    return turndownService.turndown(article.content);
  } catch (error) {
    // If Readability fails, try to convert the body content instead
    const body = doc.body ? doc.body.innerHTML : htmlString;
    return turndownService.turndown(body);
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
 * @param {Buffer} arrayBuffer
 * @returns {Promise<string>} extracted text
 */
async function parsePdf(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const pagesText = [];
  for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    pagesText.push(pageText);
  }
  return pagesText.join("\n");
}

/**
 * Returns the client environment information
 * @returns {any} - The client environment information
 */
export function getClientContext() {
  const now = new Date();
  const { language, platform, deviceMemory, hardwareConcurrency } = navigator;
  const timeFormat = Intl.DateTimeFormat().resolvedOptions();
  const timeFormatter = new Intl.DateTimeFormat(language, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZoneName: "long",
    hour12: true,
  });
  const time = timeFormatter.format(now);
  const memory = deviceMemory >= 8 ? "greater than 8 GB" : `approximately ${deviceMemory} GB`;
  return { time, language, platform, memory, hardwareConcurrency, timeFormat };
}

/**
 * Plays audio from text using the TTS model
 * @param {string} text - The text to convert to audio
 * @param {string} voice - The voice to use for TTS
 * @param {string} cancelKey - The key to cancel audio playback
 * @returns {boolean} - True if successful, false if an error occurred
 */
export async function playAudio(text, voice = "af_heart", cancelKey = "Escape") {
  const tts = await loadTTS();
  if (!tts) return false;
  if (!text) return true; // TTS loaded, nothing to play - success
  const splitter = new TextSplitterStream();
  const audioStream = tts.stream(splitter, { voice });
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 300,
    chunkOverlap: 0,
    keepSeparator: true,
  });
  const textChunks = await textSplitter.splitText(text.replace(/\n/g, "."));
  for (const chunk of textChunks) {
    splitter.push(chunk);
  }
  splitter.close();

  let shouldStop = false;
  let currentAudio = null;

  function handleKeydown(e) {
    if (e.key === cancelKey) {
      shouldStop = true;
      currentAudio?.pause();
    }
  }

  document.addEventListener("keydown", handleKeydown);

  try {
    // Process each audio chunk from the stream.
    for await (const { audio } of audioStream) {
      if (shouldStop) break;

      const url = URL.createObjectURL(audio.toBlob());

      // Play the current audio chunk and wait until it ends.
      await new Promise((resolve, reject) => {
        const audioEl = new Audio(url);
        currentAudio = audioEl;
        audioEl.play().catch(reject);
        audioEl.onended = () => {
          audioEl.remove();
          URL.revokeObjectURL(url);
          resolve();
        };
        audioEl.onerror = (err) => {
          URL.revokeObjectURL(url);
          reject(err);
        };
      });
    }

    return true;
  } catch (error) {
    console.error("Audio playback error:", error);
    return false;
  } finally {
    document.removeEventListener("keydown", handleKeydown);
  }
}

/**
 * Loads the TTS model
 * @param {string} modelId - The model ID to load
 * @param {object} modelOptions - The model options
 * @returns {Promise<KokoroTTS>} - The loaded TTS model
 */
export async function loadTTS(modelId = "onnx-community/Kokoro-82M-v1.0-ONNX", modelOptions = { dtype: "fp32", device: "webgpu" }) {
  if (!navigator.gpu) {
    window.TTS_LOADED = false;
    return false;
  }
  const tts = await KokoroTTS.from_pretrained(modelId, modelOptions);
  window.TTS_LOADED = true;
  return tts;
}

/**
 * Detects if a file is TEXT, BINARY, PDF, ZIP, or DOCX
 * @param {ArrayBuffer} buffer - The file buffer to analyze
 * @returns {string} - 'TEXT', 'BINARY', 'PDF', 'ZIP', or 'DOCX'
 */
function detectFileType(buffer) {
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
 * Retries a function with exponential backoff
 * @param {number} maxAttempts - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in milliseconds
 * @param {Function} fn - Async function to retry
 * @returns {Promise<any>} - Result of the function execution
 * @throws {Error} - Throws the last error encountered after all retries are exhausted
 */
export async function retry(maxAttempts, initialDelay, fn) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error);

      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff: initialDelay * 2^(attempt-1)
      const delay = initialDelay * Math.pow(2, attempt - 1);

      // Add some jitter to prevent thundering herd problem
      const jitter = Math.random() * 100;

      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts. Last error: ${lastError.message}`);
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
