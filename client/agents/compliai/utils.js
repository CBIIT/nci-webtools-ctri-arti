import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import mammoth from "mammoth";
import * as unpdf from "unpdf";
import * as pdfjsLib from "pdfjs-dist";

// The workerSrc property shall be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const GOGGLE_URL = "https://raw.githubusercontent.com/CBIIT/search-filters/refs/heads/main/us_ai_policy.goggle";

export async function* readStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

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

export async function search(query) {
  const params = { affiliate: "usagov_all_gov", format: "json", query: query.q };
  const url = "https://find.search.gov/search?" + new URLSearchParams(params);
  const response = await fetch("/api/proxy?" + new URLSearchParams({ url }))
  return await response.json();
}

export async function getWebsiteText({url}) {
  const response = await fetch("/api/proxy?" + new URLSearchParams({ url }));
  const bytes = await response.arrayBuffer();
  if (!response.ok) {
    const text = new TextDecoder("utf-8").decode(bytes);
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}\n${text}`);
  }
  const mimetype = response.headers.get("content-type");
  return await parseDocument(bytes, mimetype, url);
}

/**
 * Executes JavaScript code in a sandboxed Web Worker environment
 * @param {string} code - The JavaScript code to execute
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<{success: boolean, result?: any, error?: Error, logs: Array}>}
 */
export async function runJavascript({ code, timeout = 5000 }) {
  const workerUrl = location.pathname + "/code-worker.js";
  const worker = new Worker(workerUrl);

  return new Promise((resolve, reject) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve({
        success: false,
        error: { name: "TimeoutError", message: `Execution timed out after ${timeout}ms` },
        logs: [],
      });
    }, timeout);

    // Handle worker message
    worker.onmessage = (e) => {
      clearTimeout(timeoutId);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve(e.data);
    };

    // Handle worker error
    worker.onerror = (error) => {
      clearTimeout(timeoutId);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve({
        success: false,
        error: {
          name: error.name || "Error",
          message: error.message || "Unknown error occurred",
          stack: error.stack,
        },
        logs: [],
      });
    };

    // Start execution
    worker.postMessage(code);
  });
}

/**
 * Returns the text content of a document
 * @param {ArrayBuffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
export async function parseDocument(buffer, mimetype, url) {
  // strip encoding from mimetype
  let mime = mimetype.split(";")[0].trim().toLowerCase();
  let ext = url.split('.').pop().toLowerCase();
  const mimetypes ={
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }

  if (mime === mimetypes.pdf || ext === "pdf") {
    return await parsePdf(buffer);
  } else if (mime === mimetypes.docx || ext === "docx") {
    return await parseDocx(buffer);
  }

  return extractMarkdown(new TextDecoder("utf-8").decode(buffer), url);
}

export function extractMarkdown(htmlString, baseUrl) {
  const turndownService = new TurndownService()

  turndownService.addRule('remove', {
    filter: ['style', 'script'],
    replacement: () => ""
  });

  // turndownService.keep(['a']);

  // const url = new URL(baseUrl);
  // console.log(url);

  // Parse the HTML into a DOM document.
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const links = doc.querySelectorAll('a');

  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('http')) {
      link.setAttribute('href', new URL(href, baseUrl).href);
    }
  });

  // Use Readability to get the main content.
  const article = new Readability(doc).parse();
  if (!article) {
    throw new Error("Could not extract article content.");
  }
  console.log(article);
  // Convert the extracted HTML content to Markdown.
  const markdown = turndownService.turndown(article.content);
  return markdown;
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
    const pageText = textContent.items.map(item => item.str).join(' ');
    pagesText.push(pageText);
  }
  return pagesText.join('\n');
}

export function getClientEnvironment() {
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

export async function playAudio(text, voice = "af_heart", cancelKey = "Escape") {
  const tts = await preloadModels();
  if (!tts) return false;
  const splitter = new TextSplitterStream();
  const audioStream = tts.stream(splitter, { voice });
  const separators = ["\n"];
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 300,
    chunkOverlap: 0,
    separators,
    keepSeparator: true,
  });
  const textChunks = await textSplitter.splitText(text.replace(/\n/g, "."));
  for (let chunk of textChunks) {
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

      const blob = audio.toBlob();
      const url = URL.createObjectURL(blob);

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
  } catch (error) {
    console.error("Audio playback interrupted or error occurred:", error);
  } finally {
    document.removeEventListener("keydown", handleKeydown);
  }
}

export async function preloadModels() {
  window.MODELS_LOADED = window.MODELS_LOADED || false;
  if (!navigator.gpu) {
    window.MODELS_LOADED = false;
    return false;
  }
  const modelId = "onnx-community/Kokoro-82M-v1.0-ONNX";
  const modelOptions = { dtype: "fp32", device: "webgpu" };
  const tts = await KokoroTTS.from_pretrained(modelId, modelOptions);
  window.MODELS_LOADED = true;
  return tts;
}
