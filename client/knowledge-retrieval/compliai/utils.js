import mammoth from "mammoth";
import * as unpdf from "unpdf";

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

export async function search({ keywords, ...params }) {
  const query = { q: keywords, ...params };
  Object.keys(query).forEach(key => query[key] === undefined && delete query[key]);
  return (await fetch('/api/search?' + new URLSearchParams(query))).json();
 }

export async function getWebsiteText({ url, expandUrls = false }) {
  try {
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";

    // Get the response as ArrayBuffer to handle both text and binary
    const buffer = await response.arrayBuffer();

    // Handle HTML pages
    if (contentType.includes("text/html")) {
      const html = new TextDecoder().decode(buffer);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Remove unwanted elements
      ["script", "style", "nav", "header", "footer", "noscript"].forEach((tag) => {
        doc.querySelectorAll(tag).forEach((el) => el.remove());
      });

      // Expand URLs if requested
      if (expandUrls) {
        doc.querySelectorAll("a").forEach((el) => {
          const href = el.getAttribute("href");
          if (href) {
            // Convert relative URLs to absolute
            const absoluteUrl = new URL(href, url).href;
            el.textContent = `[${absoluteUrl}] ${el.textContent}`;
          }
        });
      }

      return doc.body.textContent.replace(/\s+/g, " ").trim();
    } else {
      return parseDocument(buffer, contentType);
    }
  } catch (error) {
    console.error(`Failed to extract text from ${url}:`, error);
    return "";
  }
}

/**
 * Executes JavaScript code in a sandboxed Web Worker environment
 * @param {string} code - The JavaScript code to execute
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<{success: boolean, result?: any, error?: Error, logs: Array}>}
 */
export async function runJavascript({ code, timeout = 5000 }) {
  const workerUrl =  location.pathname + "/code-worker.js";
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
      return toString(buffer);
  }
}

/**
 * Extracts text from a DOCX buffer
 * @param {Buffer} buffer
 * @returns {Promise<string>} extracted text
 */
export async function parseDocx(buffer) {
  const rawText = await mammoth.extractRawText({ buffer });
  return rawText.value || "No text found in DOCX";
}

/**
 * Extracts text from a PDF buffer
 * @param {Buffer} buffer
 * @returns {Promise<string>} extracted text
 */
export async function parsePdf(buffer) {
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
  const results = await unpdf.extractText(pdf, { mergePages: true });
  return results.text.trim() || "No text found in PDF";
}
