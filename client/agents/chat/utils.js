import { Readability } from "@mozilla/readability";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { matmul, AutoModel, AutoTokenizer, Tensor } from "@huggingface/transformers";
import dompurify from "dompurify";
import mammoth from "mammoth";
import TurndownService from "turndown";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
window.TOOLS = { search, browse, code, editor, think };

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
  try {
    const proxyEndpoint = "/api/proxy";
    while (new URL(url).pathname.startsWith(proxyEndpoint)) {
      url = decodeURIComponent(new URL(url).pathname.slice(proxyEndpoint.length).replace(/^\/+/, ""));
    }
    return await retry(3, 100, () => fetch(proxyEndpoint + "/" + encodeURIComponent(url), requestInit));
  } catch (error) {
    throw new Error(`Invalid proxy URL: ${url}`);
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

/**
 * Creates an embedder function with cached model and tokenizer
 *
 * @example
 * const embed = await createEmbedder("minishlab/potion-base-8M");
 * const embeddings = await embed(["hello", "world"]);
 *
 * @param {string} [model_name="minishlab/potion-base-8M"] - Model name
 * @param {Object} [options] - Additional options
 * @param {string} [options.model_type="model2vec"] - Model type
 * @param {string} [options.model_revision="main"] - Model revision
 * @param {string} [options.tokenizer_revision="main"] - Tokenizer revision
 * @param {string} [options.dtype="fp32"] - Data type
 * @param {string} [options.device="wasm" | "webgpu"] - Device (defaults to "webgpu" if available, otherwise "wasm")
 * @returns {Promise<(texts: string[]) => Promise<number[][]>>} - Function that generates embeddings
 */
export async function createEmbedder(model_name = "minishlab/potion-base-8M", options = {}) {
  const {
    model_type = "model2vec",
    model_revision = "main",
    tokenizer_revision = "main",
    device = navigator?.gpu ? "webgpu" : undefined, // use webgpu if available
    dtype = "fp32",
  } = options;

  // Load model and tokenizer once
  const model = await AutoModel.from_pretrained(model_name, {
    config: { model_type },
    revision: model_revision,
    device,
    dtype,
  });

  const tokenizer = await AutoTokenizer.from_pretrained(model_name, {
    revision: tokenizer_revision,
  });

  /**
   * Generate embeddings for the provided texts
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} - Text embeddings
   */
  return async function embed(texts, tokenizer_options = {}) {
    // Tokenize inputs
    const { input_ids } = await tokenizer(texts, {
      add_special_tokens: false,
      return_tensor: false,
    });

    // Calculate offsets
    const offsets = [0];
    for (let i = 0; i < input_ids.length - 1; i++) {
      offsets.push(offsets[i] + input_ids[i].length);
    }

    // Create tensors and get embeddings from flattened input ids and offsets
    const flattened_input_ids = input_ids.flat();
    const model_inputs = {
      input_ids: new Tensor("int64", flattened_input_ids, [flattened_input_ids.length]),
      offsets: new Tensor("int64", offsets, [offsets.length]),
    };

    const { embeddings } = await model(model_inputs);
    return embeddings.tolist();
  };
}

/**
 * Gets embeddings for a list of texts and computes similarity scores with a query
 * @param {string[]} texts - List of texts
 * @param {string} query - Query text
 * @param {string} model - Model name
 * @returns {Promise<{embeddings: number[][], similarities?: number[][]}>} - Embeddings and similarity scores
 */
export async function getEmbeddings(texts = [], query = "", model = "minishlab/potion-base-8M") {
  if (query) {
    const embeddings = await embed([query].concat(texts), model, { raw: true });
    const similarities = (await matmul(embeddings.slice([0, 1]), embeddings.slice([1, null]).transpose(1, 0))).mul(100);
    return { embeddings: embeddings.tolist(), similarities: similarities.tolist() };
  }
  return { embeddings: await embed(texts, model) };
}

/**
 * Creates text embeddings using Model2Vec
 * @example await embed(['hello', 'world'])
 *
 * @param {string[]} texts - Array of texts to embed
 * @param {string} [model_name='minishlab/potion-base-8M'] - Model name
 * @param {Object} [options] - Additional options
 * @param {string} [options.model_type='model2vec'] - Model type
 * @param {string} [options.model_revision='main'] - Model revision
 * @param {string} [options.tokenizer_revision='main'] - Tokenizer revision
 * @param {string} [options.dtype='fp32'] - Data type
 * @param {string} [options.device='wasm' | 'webgpu'] - Device (defaults to 'webgpu' if available, otherwise 'wasm')
 * @returns {Promise<number[][]>} - Text embeddings
 */
export async function embed(texts, model_name = "minishlab/potion-base-8M", options = {}) {
  const {
    model_type = "model2vec",
    model_revision = "main",
    tokenizer_revision = "main",
    device = navigator?.gpu ? "webgpu" : undefined, // use webgpu if available
    dtype = "fp32",
    raw = false,
  } = options;

  // Load model and tokenizer
  const model = await AutoModel.from_pretrained(model_name, {
    config: { model_type },
    revision: model_revision,
    device,
    dtype,
  });

  const tokenizer = await AutoTokenizer.from_pretrained(model_name, {
    revision: tokenizer_revision,
  });

  // Tokenize inputs
  const { input_ids } = await tokenizer(texts, {
    add_special_tokens: false,
    return_tensor: false,
  });

  // Calculate offsets
  const offsets = [0];
  for (let i = 0; i < input_ids.length - 1; i++) {
    offsets.push(offsets[i] + input_ids[i].length);
  }

  // Flatten input IDs
  const flattened_input_ids = input_ids.flat();

  // Create tensors and get embeddings
  const model_inputs = {
    input_ids: new Tensor("int64", flattened_input_ids, [flattened_input_ids.length]),
    offsets: new Tensor("int64", offsets, [offsets.length]),
  };

  const { embeddings } = await model(model_inputs);
  return raw ? embeddings : embeddings.tolist();
}

/**
 * Queries a document with a given query and returns the results
 * @param {string} document
 * @param {string} query
 * @returns {Promise<Array>} - Array of search results
 */
export async function queryDocument(document, query) {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    keepSeparator: true,
  });
  const texts = await textSplitter.splitText(document);
  const { embeddings, similarities } = await getEmbeddings(texts, query);
  const results = texts.map((text, i) => ({
    text,
    embedding: embeddings[i],
    similarity: similarities ? similarities[0][i] : null,
  }));
  return results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
}

export async function queryDocumentWithModel(document, topic, model = "us.anthropic.claude-3-5-haiku-20241022-v1:0") {
  document = truncate(document, 500_000);
  const system = `You are a research assistant. You will be given a document and a question. 

Your task is to answer the question using only the information in the document. You must not add any information that is not in the document, and you must provide exact quotes with attributions. 

CRITICAL INSTRUCTION: You must ONLY use information explicitly stated in the document. NEVER add information, inferences, or assumptions not directly present in the text.

Your response MUST:
1. Include EXACT quotes from the document with precise location references (page/section/paragraph) BEFORE any analysis or explanation
2. Use quotation marks for ALL extracted text
3. Never paraphrase or summarize when direct quotes are available
4. Clearly indicate when information requested is not in the document
5. Never attempt to fill gaps with general knowledge or assumptions
6. Always APA-style references for factual claims (Example: According to Smith (2025, para. 3), "direct quote" [URL]). Clearly mark which information comes directly from sources.

If the document doesn't contain information relevant to the question:
- State this explicitly: "The document does not contain information about [topic]"
- Do not provide alternative information or guesses
- Do not use external knowledge
- Instead, provide a comprehensive summary of the document's contents using the most relevant sections and quotes.

VERIFICATION STEPS (perform these before finalizing your answer):
- Double-check that every statement is backed by an exact quote
- Verify all quotes match the original text word-for-word
- Confirm all location references are accurate
- Ensure no information is presented that isn't directly from the document

The document is as follows: ${document}`;

  const prompt = `Answer this question about the document: "${topic}"`;

  const messages = [{ role: "user", content: [{ text: prompt }] }];
  const response = await fetch("/api/model/run", {
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
  const response = await fetch("/api/browse?" + new URLSearchParams({ url, id }));
  const bytes = await response.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(bytes);
  let results;
  if (!response.ok) {
    return `Failed to read ${url}: ${response.status} ${response.statusText}\n${text}`;
  }

  const mimetype = response.headers.get("content-type") || "text/html";
  const sections = await queryDocument(results, topic);
  const similar = sections.map((s) => ({ text: s.text, similarity: s.similarity })).slice(0, 20);
  console.log("[DEBUG] Similarity results:", similar);

  if (mimetype.includes("text/html")) {
    results = new TurndownService().turndown(dompurify.sanitize(text));
  } else {
    results = await parseDocument(bytes, mimetype, url);
  }
  return results.length > 32_000 ? await queryDocumentWithModel(results, topic) : results;
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

/**
 * JavaScript executor with ES module & import map support
 * @param {*} params
 * @param {string} params.source - Code to execute as ES module
 * @param {Object} [params.importMap={}] - Optional import map
 * @param {number} [params.timeout=5000] - Timeout in milliseconds
 * @returns {Promise<{html: string, logs: {type: string, content: any}[]}>}>}
 */
export async function code({ source, importMap = {}, timeout = 5000 }) {
  return new Promise((resolve) => {
    // Setup
    const logs = [];
    const log = (type, ...args) => logs.push({ type, content: args });
    const iframe = document.createElement("iframe");
    iframe.sandbox = "allow-scripts allow-same-origin";
    iframe.style.display = "none";

    // Handle messages from iframe
    const onMessage = (e) => {
      if (e.source !== iframe.contentWindow) return;
      if (e.data.type === "log") log(e.data.level, ...e.data.args);
      if (e.data.type === "done") {
        clearTimeout(timer);
        const html = iframe.contentDocument?.documentElement?.querySelector('#root')?.innerHTML || "";
        cleanup();
        resolve({ html, logs });
      }
    };

    // Set timeout and cleanup
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      iframe.parentNode?.removeChild(iframe);
    };

    const timer = setTimeout(() => {
      log("warn", `Execution timed out after ${timeout}ms`);
      cleanup();
      resolve({ html: "", logs });
    }, timeout);

    window.addEventListener("message", onMessage);

    // Set up console capture and error handling
    const initScript = () => {
      ['log','warn','error','info','debug'].forEach(level => {
        const orig = console[level];
        console[level] = (...args) => {
          try {
            window.parent.postMessage({
              type: 'log', 
              level,
              args: args.map(a => {
                try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                catch { return String(a); }
              })
            }, '*');
          } catch {}
          orig.apply(console, args);
        };
      });
      
      // Capture errors
      window.addEventListener('error', e => {
        console.error(`${e.message} [line ${e.lineno}]`);
        e.preventDefault();
      });
    }

    // Generate HTML with console capture and error handling
    const html = [
      `<!DOCTYPE html><html>`,
      `<head><script type="importmap">${JSON.stringify(importMap)}</script><script>(${initScript.toString()})()</script></head>`,
      `<body><div id="root"></div><script type="module">${source}; window.parent.postMessage({type: 'done'}, '*');</script></body>`,
      `</html>`,
    ].join("");

    try {
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument;
      doc.open();
      doc.write(html);
      doc.close();
    } catch (e) {
      log("error", `Setup error: ${e.message}`);
      cleanup();
      resolve({ html: "", logs });
    }
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

function getNaturalDateTime(date = new Date()) {
  const userLocale = navigator.language || "en-US";

  const dateFormatter = new Intl.DateTimeFormat(userLocale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedDate = dateFormatter.format(date);

  const hours = date.getHours();

  let timeOfDay;
  if (hours >= 0 && hours < 6) {
    timeOfDay = "night"; // 12:00 AM - 5:59 AM
  } else if (hours >= 6 && hours < 12) {
    timeOfDay = "morning"; // 6:00 AM - 11:59 AM
  } else if (hours >= 12 && hours < 18) {
    timeOfDay = "afternoon"; // 12:00 PM - 5:59 PM
  } else {
    timeOfDay = "evening"; // 6:00 PM - 11:59 PM
  }

  return `${formattedDate} (${timeOfDay})`;
}

/**
 * Returns the client environment information
 * @returns {any} - The client environment information
 */
export function getClientContext() {
  const now = new Date();
  const { language, platform, deviceMemory, hardwareConcurrency } = navigator;
  const timeFormat = Intl.DateTimeFormat().resolvedOptions();
  const time = getNaturalDateTime(now);
  const memory = deviceMemory >= 8 ? "greater than 8 GB" : `approximately ${deviceMemory} GB`;
  const getFileContents = (file) => localStorage.getItem("file:" + file) || localStorage.setItem("file:" + file, "") || "";
  const filenames = new Array(localStorage.length)
    .fill(0)
    .map((_, i) => localStorage.key(i))
    .filter((e) => e.startsWith("file:"))
    .map((e) => e.replace("file:", ""));
  const main = ["_profile.txt", "_memory.txt", "_workspace.txt", "_knowledge.txt", "_plan.txt", "_heuristics.txt"].map((file) => ({
    file,
    contents: getFileContents(file),
  }));
  main.push({ filenames });
  main.push({ description: "the filenames key contains the list of files. please review the items under 'important' carefully" });
  return { main: JSON.stringify(main, null, 2), time, language, platform, memory, hardwareConcurrency, timeFormat };
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

export function renderHtml(html, { timeout = 30000, waitTime = 250, container = document.body } = {}) {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms");
    iframe.style.cssText = "width:100%; height:100%; display:none;";
    container.appendChild(iframe);

    const cleanup = () => {
      try {
        container.removeChild(iframe);
      } catch {}
    };

    const getHtml = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        resolve(doc.documentElement.outerHTML);
      } catch {
        resolve(""); // Return empty string instead of rejecting
      } finally {
        cleanup();
      }
    };

    const timeoutId = setTimeout(getHtml, timeout);

    // Silence console errors by catching them in event handlers
    iframe.onload = () => {
      setTimeout(() => {
        clearTimeout(timeoutId);
        getHtml();
      }, waitTime);
    };

    iframe.onerror = () => {
      clearTimeout(timeoutId);
      resolve(""); // Return empty string instead of rejecting
      cleanup();
    };

    // Prevent errors from bubbling to console
    window.addEventListener(
      "error",
      (e) => {
        if (e.target === iframe || iframe.contentWindow === e.target.contentWindow) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    try {
      iframe.src = "about:blank";
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
    } catch {
      clearTimeout(timeoutId);
      resolve(""); // Return empty string instead of rejecting
      cleanup();
    }
  });
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
