import { createMemo } from "solid-js";
import { loadPyodide } from "pyodide";
import { parseDocument } from "./parsers.js";
import { inference } from "./similarity.js";
import { jsonToXml } from "./xml.js";
window.inference = inference;

export const TOOLS = { search, browse, code, editor, think };
window.TOOLS = TOOLS;

/**
 * Runs JSON tools with the given input and returns the results. Each tool is a function that takes a JSON input and returns a JSON output.
 * @param {any} toolUse - The tool use object
 * @param {any} tools - The tools object with tool names as keys and functions as values.
 * @returns {Promise<any>} - The tool output
 */
export async function runTool(toolUse, tools = window.TOOLS) {
  let { toolUseId, name, input } = toolUse;
  try {
    const results = await tools?.[name]?.(input);
    const content = [{ json: { results } }];
    return { toolUseId, content };
  } catch (error) {
    console.error("Tool error:", error);
    const errorText = error.stack || error.message || String(error);
    const content = [{ text: `Error running ${name}: ${errorText}` }];
    return { toolUseId, content };
  }
}

/**
 * Executes Python code using Pyodide
 * @param {string} code - The Python code to execute
 * @returns {Promise<any>} - The result of the executed Python code
 */
export async function runPython(code) {
  const logs = [];
  const log = (msg) => logs.push(msg);
  window.pyodide ||= await loadPyodide({
    stdout: log,
    stderr: log,
  });
  const pyodide = window.pyodide;
  await pyodide.loadPackagesFromImports(code);
  const result = await pyodide.runPythonAsync(code);
  if (result) logs.push(result);
  return logs;
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
 * Searches for the given query
 * @param {string} query - The search term
 * @param {number} maxResults - Maximum results to return (default 100)
 * @returns {Promise<Array>} - Array of search results
 */
export async function search({ query }) {
  const response = await fetch("/api/search?" + new URLSearchParams({ q: query })).then((r) => r.json());
  const extract = (r) => ({
    url: r.url,
    title: r.title,
    description: r.description,
    extra_snippets: r.extra_snippets,
    age: r.age,
    page_age: r.page_age,
    article: r.article,
  });
  const results = {
    web: response.web?.web?.results?.map(extract),
    news: response.news?.results?.map(extract),
    gov: response.gov?.results,
  };
  return results;
}

export async function queryDocumentWithModel(document, topic, model = "us.anthropic.claude-3-5-haiku-20241022-v1:0") {
  if (!topic) return document;
  document = truncate(document, 500_000);
  const system = `You are a research assistant. You will be given a document and a question. 

Your task is to answer the question using only the information in the document and provide a fully-verifiable, academic report in markdown format. You must not add any information that is not in the document, and you must provide exact quotes and urls with attributions.

CRITICAL INSTRUCTION: You must ONLY use information explicitly stated in the document. NEVER add information, inferences, or assumptions not directly present in the text. ALWAYS include links (eg: markdown - [An Example  Link](http://example.com), html - <a href="http://example.com">an example link</a>, etc) from the document AS-IS.

Your response MUST:
1. Present research academically - always includes a proper references section at the end containing a markdown list in full APA format with all sources cited in the response, including the title, author, date, and url.
2. Include EXACT quotes and url references from the document with precise location references (page/section/paragraph) BEFORE any analysis or explanation. If any text is associated with a URL (eg: if it is a link), INCLUDE THE URL AS-IS AS A MARKDOWN LINK.
3. Always use inline APA-style references for factual claims (Example: According to Smith (2025, para. 3), "direct quote" [URL]). Clearly mark which information comes directly from sources.
4. Always include EXACT inline markdown url references as-is for any navigational entities referenced in the document, including links to other documents, websites, or sections within the document.
5. Use quotation marks for ALL extracted text and urls
6. NEVER paraphrase or summarize when direct quotes are available
7. Clearly indicate when information requested is not in the document
8. Never attempt to fill gaps with general knowledge or assumptions
9. Always include exact urls from the document in the response

If the document doesn't contain information relevant to the question:
- State this explicitly: "The document does not contain information about [topic]" and suggest avoiding this source in the future and using a different document or source.
- Do not provide alternative information or guesses
- Do not use external knowledge
- Instead, provide a comprehensive summary of the document's contents using the most relevant sections and quotes

VERIFICATION STEPS (perform these before finalizing your answer):
- Double-check that every statement is backed by an exact quote
- Verify all quotes match the original text word-for-word
- Confirm all location references are accurate
- Ensure no information is presented that isn't directly from the document

The document is as follows: 

<document>${document}</document>`;

  const prompt = `Answer this question about the document: "${topic}"`;

  const messages = [{ role: "user", content: [{ text: prompt }] }];
  const response = await fetch("/api/model", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages, system }),
  });
  const results = await response.json();
  return results?.output?.message?.content?.[0]?.text || truncate(document);
}

/**
 * Logs thoughts to the _thoughts.txt file
 * TODO: perform further analyses on thoughts and extract connections between them
 *
 * @param {object} params
 * @param {string} params.thought - The thought to log
 */
export async function think({ thought }) {
  editor({
    command: "insert",
    path: "_thoughts.txt",
    insert_line: 0,
    new_str: thought,
  });
}

/**
 * Truncates a string to a maximum length and appends a suffix
 * @param {string} str - The string to truncate
 * @param {number} maxLength - The maximum length of the string
 * @param {string} suffix - The suffix to append
 * @returns {string} - The truncated string
 */
export function truncate(str, maxLength = 10_000, suffix = "\n ... (truncated)") {
  return str.length > maxLength ? str.slice(0, maxLength) + suffix : str;
}

/**
 * Returns the content of a website as text
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function browse({ url, topic }) {
  window.id ||= Math.random().toString(36).slice(2);
  const response = await fetch("/api/browse/" + url);
  const bytes = await response.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(bytes);
  if (!response.ok) {
    return `Failed to read ${url}: ${response.status} ${response.statusText}`;
  }

  const mimetype = response.headers.get("content-type") || "text/html";
  const results = await parseDocument(bytes, mimetype, url);
  return await queryDocumentWithModel(results, topic);
}

/**
 * editor function with newline handling
 *
 * @param {Object} params - The tool parameters
 * @param {string} params.command - Command type (view, str_replace, create, insert, undo_edit)
 * @param {string} params.path - Path to the file
 * @param {Array<number>} [params.view_range] - Range of lines to view [start, end]
 * @param {string} [params.old_str] - String to replace
 * @param {string} [params.new_str] - Replacement string or text to insert
 * @param {string} [params.file_text] - Content for new file
 * @param {number} [params.insert_line] - Line number to insert after
 * @param {Object} [storage] - Storage interface with getItem, setItem methods
 * @returns {string} - Result message
 */
function editor(params, storage = localStorage) {
  // Validate the required parameters for all commands
  const { command, path } = params;
  if (!path) return "Error: File path is required";
  if (!command) return "Error: Command is required";

  // Define storage keys for file content and history
  const fileKey = `file:${path}`;
  const historyKey = `history:${path}`;

  // Normalize any string with newlines to use consistent LF format
  const normalizeNewlines = (text) => {
    if (typeof text !== "string") return "";
    return text.replace(/\r\n/g, "\n");
  };

  try {
    switch (command) {
      case "view": {
        // Get file content, error if not found
        const content = storage.getItem(fileKey);
        if (content === null) {
          return `File not found: ${path}`;
        }

        // Split into lines and apply view range if provided
        const lines = normalizeNewlines(content).split("\n");
        const [start, end] = params.view_range || [1, lines.length];
        const startLine = Math.max(1, start);
        const endLine = end === -1 ? lines.length : Math.min(end, lines.length);

        // Format and return the requested lines
        return lines
          .slice(startLine - 1, endLine)
          .map((line, idx) => `${startLine + idx}: ${line}`)
          .join("\n");
      }

      case "str_replace": {
        // Validate required parameters
        const { old_str, new_str } = params;
        if (old_str === undefined) {
          return "Error: old_str parameter is required for str_replace";
        }
        if (new_str === undefined) {
          return "Error: new_str parameter is required for str_replace";
        }

        // Normalize the search string and check for empty value
        const normalizedOldStr = normalizeNewlines(old_str);
        if (normalizedOldStr === "") {
          // in this case, simply put this string at the beginning of the file
          // return "Error: old_str parameter cannot be empty for str_replace";
        }

        // Get file content, error if not found
        const content = storage.getItem(fileKey);
        if (content === null) {
          return `File not found: ${path}`;
        }

        // Normalize file content
        const normalizedContent = normalizeNewlines(content);

        // Check for exactly one occurrence of the old string
        let count = 0;
        let position = 0;
        while (true) {
          position = normalizedContent.indexOf(normalizedOldStr, position);
          if (position === -1) break;
          count++;
          if (normalizedOldStr === "") break;
          position += normalizedOldStr.length;
        }

        if (count === 0) {
          return "The specified text was not found in the file.";
        }

        if (count > 1) {
          return `Found ${count} occurrences of the text. The replacement must match exactly one location.`;
        }

        // Save backup before modifying
        storage.setItem(historyKey, content);

        // Replace the text with new_str (preserving newline format in new_str)
        const newContent = normalizedContent.replace(normalizedOldStr, normalizeNewlines(new_str));
        storage.setItem(fileKey, newContent);

        return "Successfully replaced text at exactly one location.";
      }

      case "create": {
        // Create the file with the provided content or empty string
        const fileContent = params.file_text !== undefined ? normalizeNewlines(params.file_text) : "";
        const overwritten = storage.getItem(fileKey) !== null;
        storage.setItem(fileKey, fileContent);
        if (overwritten) {
          return `Overwrote existing file: ${path}`;
        } else {
          return `Successfully created file: ${path}`;
        }
      }

      case "insert": {
        // Validate required parameters
        const { insert_line, new_str } = params;
        if (new_str === undefined) {
          return "Error: new_str parameter is required for insert";
        }
        if (insert_line === undefined) {
          return "Error: insert_line parameter is required for insert";
        }

        // Get file content, error if not found
        const content = storage.getItem(fileKey);
        if (content === null) {
          return `File not found: ${path}`;
        }

        // Save backup before modifying
        storage.setItem(historyKey, content);

        // Split content into lines and normalize
        const lines = normalizeNewlines(content).split("\n");

        // Ensure insert_line is within valid range
        const insertLineIndex = Math.min(Math.max(0, insert_line), lines.length);

        // Process the new content to insert
        const normalizedNewStr = normalizeNewlines(new_str);
        const linesToInsert = normalizedNewStr.split("\n");

        // Insert the new lines at the specified position
        lines.splice(insertLineIndex, 0, ...linesToInsert);

        // Join lines and save the modified content
        const newContent = lines.join("\n");
        storage.setItem(fileKey, newContent);

        return `Successfully inserted text after line ${insertLineIndex}.`;
      }

      case "undo_edit": {
        // Check if there's a history entry for this file
        const previousContent = storage.getItem(historyKey);
        if (previousContent === null) {
          return `No previous edit found for file: ${path}`;
        }

        // Restore the previous content
        storage.setItem(fileKey, previousContent);
        storage.removeItem(historyKey);

        return `Successfully reverted last edit for file: ${path}`;
      }

      default:
        return `Error: Unknown command: ${command}`;
    }
  } catch (error) {
    return `Error processing command ${command}: ${error.message}`;
  }
}

window.code = code;
export async function code({ language, source, timeout = 5_000 }) {
  const bridge = `
    (()=>{const p=globalThis.parent?.postMessage?.bind(globalThis.parent)
                 ?? globalThis.postMessage?.bind(globalThis)
                 ??(()=>{}),s=m=>p({type:"log",msg:m});
      ["log","warn","error","info","debug"].forEach(k=>{
        const o=console[k];console[k]=(...a)=>(s(a.join(" ")),o(...a));});
      globalThis.onerror=(m,_u,l)=>(s(\`\${m} [line \${l}]\`),true);
    })();
  `;

  if (language === "javascript") {
    return await new Promise((res) => {
      const logs = [];

      // wrap user code so we know when it’s done
      const workerCode = [bridge, source, 'self.postMessage({type:"done"})'].join(";");
      const worker = new Worker(URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" })), { type: "module" });
      const kill = setTimeout(() => (worker.terminate(), res({ logs })), timeout);

      worker.onmessage = (e) => {
        if (e.data?.type === "log") logs.push(e.data.msg);
        if (e.data?.type === "done") {
          clearTimeout(kill);
          worker.terminate();
          res({ logs });
        }
      };
      worker.onerror = (e) => logs.push(e.message);
    });
  }

  if (language === "html") {
    return await new Promise((res) => {
      const logs = [];
      const frame = Object.assign(document.createElement("iframe"), { style: "position:absolute; left: -9999px;" });
      const listener = (e) => {
        if (e.source !== frame.contentWindow) return;
        console.log(e.data);
        e.data?.type === "log" && logs.push(e.data.msg);
        e.data?.type === "done" && cleanup();
      };
      window.addEventListener("message", listener);
      document.body.appendChild(frame);

      const doc = new DOMParser().parseFromString(source, "text/html");
      const script = Array.from(doc.querySelectorAll("script:not([src])")).find((s) => ["", "text/javascript", "module"].includes(s.type));
      if (script) {
        script.innerHTML += `;parent.postMessage({type: "done"});`;
      }
      const bridgeScript = document.createElement("script");
      bridgeScript.text = bridge;
      doc.head.prepend(bridgeScript);
      const html = doc.documentElement.outerHTML;

      const cleanup = () => {
        clearTimeout(kill);
        window.removeEventListener("message", listener);
        const iframeDocument = frame.contentDocument || frame.contentWindow.document;
        const { body, documentElement } = iframeDocument;
        const height = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          documentElement.clientHeight,
          documentElement.scrollHeight,
          documentElement.offsetHeight
        );
        frame.remove();
        res({ html, logs, height });
      };

      const kill = setTimeout(cleanup, timeout); // fallback
      frame.srcdoc = html;
    });
  }

  if (language === "python") {
    return { logs: await runPython(source) };
  }

  return { logs: ["Unsupported language"] };
}

/**
 * Returns the client environment information
 * @returns {any} - The client environment information
 */
export function getClientContext(important = {}) {
  const now = new Date();
  const { language, platform, deviceMemory, hardwareConcurrency } = navigator;
  const timeFormat = Intl.DateTimeFormat().resolvedOptions();
  const time = new Date().toDateString();
  const memory = deviceMemory >= 8 ? "greater than 8 GB" : `approximately ${deviceMemory} GB`;
  const getFileContents = (file) => localStorage.getItem("file:" + file) || localStorage.setItem("file:" + file, "") || "";
  const filenames = new Array(localStorage.length)
    .fill(0)
    .map((_, i) => localStorage.key(i))
    .filter((e) => e.startsWith("file:"))
    .map((e) => e.replace("file:", ""));
  const main = ["_profile.txt", "_memory.txt", "_insights.txt", "_workspace.txt", "_knowledge.txt", "_patterns.txt"].map((file) => ({
    file,
    contents: getFileContents(file),
  }));
  main.push({ description: "The filenames key contains the list of files. " });
  main.push({ filenames });
  if (Object.keys(important).length > 0) {
    main.push({ additionalInstructions: "Please review the items under 'important' carefully" });
    main.push({ important });
  }
  console.log(main);
  window.jsonToXml = jsonToXml;
  return { main: JSON.stringify(main), time, language, platform, memory, hardwareConcurrency, timeFormat };
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

/**
 * Automatically scrolls to bottom when user has scrolled past the specified threshold.
 * @param {number} thresholdPercent - Value between 0-1 representing how close to bottom (0.9 = 90%)
 * @param {Element|string|null} container - DOM element, CSS selector, or null for window scrolling
 * @returns {boolean} - Whether the scroll was performed
 * @example
 * // Window scrolling (default)
 * setInterval(() => autoscroll(0.8), 1000);
 *
 * // Container element scrolling
 * autoscroll(0.9, document.getElementById('chat-box'));
 *
 * // CSS selector scrolling
 * autoscroll(0.9, '#message-container');
 */
export function autoscroll(thresholdPercent = 0.8, container = null) {
  if (typeof container === "string") {
    container = document.querySelector(container);
  }
  const isWindowScroll = !(container instanceof Element);
  const scrollTop = isWindowScroll ? window.scrollY : container.scrollTop;
  const clientHeight = isWindowScroll ? window.innerHeight : container.clientHeight;
  const scrollHeight = isWindowScroll ? document.body.scrollHeight : container.scrollHeight;
  const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
  if (scrollPercentage >= thresholdPercent) {
    if (isWindowScroll) {
      window.scrollTo(0, scrollHeight);
    } else {
      container.scrollTop = scrollHeight;
    }
    return true;
  }

  return false;
}

export function toCsv(data = [], headers = null) {
  headers ||= Object.keys(data?.[0] || {});
  const serialize = value => value.includes(',') ? `"${value}"` : value;
  const rows = data.map(row => headers.map(field => row[field]));
  const csv = [headers].concat(rows).map(row => row.map(serialize).join(','));
  return csv.join('\n');
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  downloadBlob(filename, blob);
}

export function downloadJson(filename, json) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  downloadBlob(filename, blob);
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([toCsv(csv)], { type: "text/csv" });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function convertToAccessorOptions(options) {
  // Resolve the options object if it's passed as an accessor
  const resolvedOptions = typeof options === "function" ? options() : options;

  // Create a new object where each property is wrapped in createMemo
  return Object.entries(resolvedOptions).reduce(
    (reactiveOptions, [key, value]) => {
      // Use createMemo to make each property access reactive
      reactiveOptions[key] = createMemo(() => {
        // If the original options object was itself reactive,
        // accessing it here ensures dependencies are tracked.
        const currentOptions = typeof options === "function" ? options() : options;
        return currentOptions[key]; // Return the current value for this key
      });
      return reactiveOptions;
    },
    {} // Start with an empty object
  );
}

/**
 * Opens a new chat window and copies sessionStorage items to it
 * @param {Event} e - The click event that triggered the new chat
 * @param {string} e.target.href - The URL to open in the new window
 * @returns {void}
 */
export function openInternalLinkInNewTab(e) {
  e.preventDefault();
  const newWindow = window.open(e.target.href, '_blank'); // takes url from href of anchor tag
  
  newWindow.addEventListener('load', function() {
      // Copy all sessionStorage items
      for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          const value = sessionStorage.getItem(key);
          newWindow.sessionStorage.setItem(key, value);
      }
  });
}
