import mammoth from "mammoth";
import * as unpdf from "unpdf";

export async function search({ keywords, maxResults = 10 }) {
  const results = [];
  let formData = new URLSearchParams();
  formData.append("q", keywords);

  while (results.length < maxResults) {
    const response = await fetch(`/api/proxy?url=https://html.duckduckgo.com/html/?q=${keywords}`);
    const html = await response.text();
    const parser = new DOMParser();
    const document = parser.parseFromString(html, "text/html");

    // Get results
    const elements = document.querySelectorAll("#links .web-result");
    const pageResults = [];

    for (const el of elements) {
      if (results.length >= maxResults) break;

      const titleEl = el.querySelector(".result__title");
      const snippetEl = el.querySelector(".result__snippet");
      const linkEl = el.querySelector(".result__url");

      if (titleEl && linkEl) {
        const ddgUrl = new URL(linkEl.href, "https://duckduckgo.com");
        const realUrl = ddgUrl.pathname === "/l/" ? new URLSearchParams(ddgUrl.search).get("uddg") : linkEl.href;

        pageResults.push({
          title: titleEl?.textContent?.trim(),
          url: decodeURIComponent(realUrl),
          snippet: snippetEl?.textContent?.trim(),
          // headers: Object.fromEntries(response.headers),
        });
      }
    }

    // Fetch all page contents in parallel
    const processedResults = await Promise.all(
      pageResults.map(async (result) => ({
        ...result,
        body: await getWebsiteText({ url: result.url }),
      }))
    );

    results.push(...processedResults);

    // Get next page data
    const form = document.querySelector("#links form");
    if (!form) break;

    formData = new URLSearchParams();
    form.querySelectorAll("input").forEach((input) => {
      formData.append(input.name, input.value);
    });

    if (!form || elements.length === 0) break;
  }

  // retry in case of proxy error
  if (!results.length || (results.length === 1 && !results[0].title.trim().length)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return await search({ keywords, maxResults });
  }

  return results;
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

function handleMessage(e) {
  const code = e.data;

  // Capture console methods
  const logs = [];
  const originalConsole = {};
  ["log", "warn", "error", "info", "debug"].forEach((method) => {
    originalConsole[method] = self.console[method];
    self.console[method] = (...args) => {
      logs.push({
        type: method,
        args: args.map((arg) =>
          arg instanceof Error
            ? {
                name: arg.name,
                message: arg.message,
                stack: arg.stack,
              }
            : arg
        ),
      });
    };
  });

  try {
    // Execute the code and get the result
    const result = eval(code);

    // Handle promises
    if (result instanceof Promise) {
      result.then(
        (value) => self.postMessage({ success: true, result: value, logs }),
        (error) =>
          self.postMessage({
            success: false,
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
            logs,
          })
      );
    } else {
      self.postMessage({ success: true, result, logs });
    }
  } catch (error) {
    self.postMessage({
      success: false,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      logs,
    });
  }
}

/**
 * Executes JavaScript code in a sandboxed Web Worker environment
 * @param {string} code - The JavaScript code to execute
 * @param {number} [timeout=5000] - Timeout in milliseconds
 * @returns {Promise<{success: boolean, result?: any, error?: Error, logs: Array}>}
 */
export async function runJavascript({ code, timeout = 5000 }) {
  // Create a blob URL for the worker
  const blob = new Blob([`self.onmessage = ${handleMessage.toString()}`], { type: "application/javascript" });
  const workerUrl = URL.createObjectURL(blob);

  // Create the worker
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
