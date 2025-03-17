import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { Readability } from "@mozilla/readability";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import mammoth from "mammoth";
import TurndownService from "turndown";
import * as pdfjsLib from "pdfjs-dist";
import { customContext } from "./config.js";
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

window.TOOLS = { search, browse, code, str_replace_editor, ecfr, federalRegister };

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
    data = await fetchProxy("https://find.search.gov/search?" + new URLSearchParams({ ...params, page: page++ })).then((r) => r.json());
    if (data?.results?.length) {
      allResults.push(...data.results);
    } else {
      break;
    }
  } while (allResults.length < Math.min(data.total, maxResults));

  return allResults.slice(0, maxResults);
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
export async function browse({ url }) {
  const response = await fetchProxy(url);
  const bytes = await response.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(bytes);
  if (!response.ok) {
    return `Failed to read ${url}: ${response.status} ${response.statusText}\n${text}`;
  }
  const mimetype = response.headers.get("content-type");
  if (mimetype.includes("text/html")) {
    const html = await renderHtml(text);
    return truncate(sanitizeHTML(html), 100_000);
  }
  return await parseDocument(bytes, mimetype, url);
}
/**
 * str_replace_editor function with improved newline handling
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
function str_replace_editor(params, storage = localStorage) {
  // Validate the required parameters for all commands
  const { command, path } = params;
  if (!path) return "Error: File path is required";
  if (!command) return "Error: Command is required";
  
  // Define storage keys for file content and history
  const fileKey = `file:${path}`;
  const historyKey = `history:${path}`;
  
  // Normalize any string with newlines to use consistent LF format
  const normalizeNewlines = (text) => {
    if (typeof text !== 'string') return '';
    return text.replace(/\r\n/g, '\n');
  };
  
  try {
    switch (command) {
      case 'view': {
        // Get file content, error if not found
        const content = storage.getItem(fileKey);
        if (content === null) {
          return `File not found: ${path}`;
        }
        
        // Split into lines and apply view range if provided
        const lines = normalizeNewlines(content).split('\n');
        const [start, end] = params.view_range || [1, lines.length];
        const startLine = Math.max(1, start);
        const endLine = end === -1 ? lines.length : Math.min(end, lines.length);
        
        // Format and return the requested lines
        return lines
          .slice(startLine - 1, endLine)
          .map((line, idx) => `${startLine + idx}: ${line}`)
          .join('\n');
      }
      
      case 'str_replace': {
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
          return 'The specified text was not found in the file.';
        }
        
        if (count > 1) {
          return `Found ${count} occurrences of the text. The replacement must match exactly one location.`;
        }
        
        // Save backup before modifying
        storage.setItem(historyKey, content);
        
        // Replace the text with new_str (preserving newline format in new_str)
        const newContent = normalizedContent.replace(normalizedOldStr, normalizeNewlines(new_str));
        storage.setItem(fileKey, newContent);
        
        return 'Successfully replaced text at exactly one location.';
      }
      
      case 'create': {
        // Create the file with the provided content or empty string
        const fileContent = params.file_text !== undefined ? normalizeNewlines(params.file_text) : '';
        const overwritten = storage.getItem(fileKey) !== null;
        storage.setItem(fileKey, fileContent);
        if (overwritten) {
          return `Overwrote existing file: ${path}`;
        } else {
          return `Successfully created file: ${path}`;
        }
      }
      
      case 'insert': {
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
        const lines = normalizeNewlines(content).split('\n');
        
        // Ensure insert_line is within valid range
        const insertLineIndex = Math.min(Math.max(0, insert_line), lines.length);
        
        // Process the new content to insert
        const normalizedNewStr = normalizeNewlines(new_str);
        const linesToInsert = normalizedNewStr.split('\n');
        
        // Insert the new lines at the specified position
        lines.splice(insertLineIndex, 0, ...linesToInsert);
        
        // Join lines and save the modified content
        const newContent = lines.join('\n');
        storage.setItem(fileKey, newContent);
        
        return `Successfully inserted text after line ${insertLineIndex}.`;
      }
      
      case 'undo_edit': {
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
 * Interacts with the eCFR API to retrieve regulatory information
 * @param {Object} input - Parameters for the eCFR API
 * @param {string} input.path - The complete API path including format extension (.json or .xml)
 * @param {Object} input.params - Query parameters to include in the request
 * @returns {Promise<Object|string>} - Response from the eCFR API (JSON object or XML string)
 */
export async function ecfr({ path, params = {} }) {
  const baseUrl = "https://www.ecfr.gov/api";
  const url = new URL(baseUrl + path);

  // Add query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(`${key}[]`, v));
    } else if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  try {
    const response = await fetch("/api/proxy?" + new URLSearchParams({ url: url.toString() }));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`eCFR API error (${response.status}): ${errorText}`);
    }

    let results = path.endsWith(".json") ? await response.json() : await response.text();
    const stringifiedResults = JSON.stringify(results, null, 2);
    const limit = 10_000;
    if (stringifiedResults.length > limit) {
      results = stringifiedResults.slice(0, limit) + "\n... (truncated)";
    }
    return results;
  } catch (error) {
    console.error("eCFR API error:", error);
    throw error;
  }
}

/**
 * Interacts with the Federal Register API to retrieve document information
 * @param {Object} input - Parameters for the Federal Register API
 * @param {string} input.path - The API path including format extension (.json or .csv)
 * @param {Object} input.params - Query parameters to include in the request
 * @returns {Promise<Object|string>} - Response from the Federal Register API
 */
export async function federalRegister({ path, params = {} }) {
  const baseUrl = "https://www.federalregister.gov/api/v1";
  const url = new URL(baseUrl + path);

  // Add query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(`${key}[]`, v));
    } else if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  try {
    const response = await fetch("/api/proxy?" + new URLSearchParams({ url: url.toString() }));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Federal Register API error (${response.status}): ${errorText}`);
    }

    let results = path.endsWith(".json") ? await response.json() : await response.text();
    const stringifiedResults = JSON.stringify(results, null, 2);
    const limit = 10_000;
    if (stringifiedResults.length > limit) {
      results = stringifiedResults.slice(0, limit) + "\n... (truncated)";
    }
    return results;
  } catch (error) {
    console.error("Federal Register API error:", error);
    throw error;
  }
}
/**
 * Enhanced code execution function with HTML template, module support, full DOM state capture, and console output
 * 
 * This updated version:
 *  - Retrieves the HTML template.
 *  - Processes each module from localStorage.
 *  - Processes the main source code similarly.
 *  - Combines the processed module codes and the processed main source code.
 *  - CAPTURES ALL CONSOLE OUTPUT (log, warn, error, info, debug).
 *  - Captures and returns the COMPLETE RENDERED DOM STATE after execution finishes.
 *  - Uses a slight delay to ensure all DOM manipulations are complete before capturing.
 *  - Returns structured data with console output and the full rendered DOM.
 *  - Supports both visible (new window) and invisible (hidden iframe) execution modes.
 * 
 * @param {Object} params - The parameters for code execution
 * @param {string} params.source - JavaScript code to execute
 * @param {string} [params.html] - Path to an HTML template in localStorage
 * @param {Array<string>} [params.modules] - List of module filenames to load from localStorage
 * @param {number} [params.timeout=5000] - Execution timeout in milliseconds
 * @param {boolean} [params.visible=false] - Whether to show in a new window
 * @returns {Promise<Object>} - Object containing { output, renderedDOM, error? }
 */
export async function code({ source, html, modules = [], timeout = 5000, visible = false }) {
  // Generate unique ID for this execution
  const instanceId = `code_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  console.log("[DEBUG] Generated instanceId:", instanceId);

  // Retrieve HTML template content from localStorage or use default.
  let htmlContent = "";
  if (html) {
    const templateKey = html.startsWith('file:') ? html : `file:${html}`;
    htmlContent = localStorage.getItem(templateKey);
    console.log("[DEBUG] Retrieved HTML template for key:", templateKey);
    if (!htmlContent) {
      console.error("[DEBUG] HTML template not found");
      return `Error: Template not found: ${templateKey}`;
    }
  } else {
    htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Code Execution</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .output { background: #f5f5f5; padding: 10px; border-left: 4px solid #333; margin-top: 20px; }
    .error { color: #c00; }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="output" class="output"></div>
</body>
</html>`;
    console.log("[DEBUG] Using default HTML template");
  }
  console.log("[DEBUG] Final HTML content:\n", htmlContent);

  // Helper to process code:
  //  - Removes relative import statements.
  //  - For modules (non-"source"), also strips out "export" keywords.
  function processCode(code, label = "source") {
    console.log(`[DEBUG] Starting processCode for ${label}`);
    const lines = code.split("\n");
    let inImport = false;
    let importBuffer = "";
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!inImport) {
        if (line.trim().startsWith("import")) {
          console.log(`[DEBUG] Found import start in ${label}:`, line);
          inImport = true;
          importBuffer = line;
          if (line.includes(";")) {
            if (importBuffer.match(/['"](?:\.{1,2}\/[^'"]+)['"]/)) {
              console.log(`[DEBUG] Removing relative import in ${label}:`, importBuffer);
              inImport = false;
              importBuffer = "";
              continue;
            } else {
              console.log(`[DEBUG] Keeping non-relative import in ${label}:`, importBuffer);
              result.push(importBuffer);
              inImport = false;
              importBuffer = "";
              continue;
            }
          }
        } else {
          result.push(line);
        }
      } else {
        importBuffer += "\n" + line;
        if (line.includes(";")) {
          if (importBuffer.match(/['"](?:\.{1,2}\/[^'"]+)['"]/)) {
            console.log(`[DEBUG] Removing relative multi-line import in ${label}:`, importBuffer);
            inImport = false;
            importBuffer = "";
            continue;
          } else {
            console.log(`[DEBUG] Keeping non-relative multi-line import in ${label}:`, importBuffer);
            result.push(importBuffer);
            inImport = false;
            importBuffer = "";
          }
        }
      }
    }
    if (inImport && importBuffer) {
      if (!importBuffer.match(/['"](?:\.{1,2}\/[^'"]+)['"]/)) {
        console.log(`[DEBUG] Keeping incomplete non-relative import in ${label}:`, importBuffer);
        result.push(importBuffer);
      } else {
        console.log(`[DEBUG] Removing incomplete relative import in ${label}:`, importBuffer);
      }
    }
    let processed = result.join("\n");
    if (label !== "source") {
      processed = processed.replace(/\bexport\s+/g, "");
      console.log(`[DEBUG] Removed export keywords in ${label}`);
    }
    console.log(`[DEBUG] Finished processCode for ${label}`);
    return processed;
  }

  // Process module files
  const moduleContents = [];
  if (modules && modules.length > 0) {
    for (const moduleName of modules) {
      console.log("[DEBUG] Processing module:", moduleName);
      const moduleKey = moduleName.startsWith('file:') ? moduleName : `file:${moduleName}`;
      const moduleCode = localStorage.getItem(moduleKey);
      if (!moduleCode) {
        console.warn(`[DEBUG] Module not found: ${moduleKey}`);
        continue;
      }
      console.log("[DEBUG] Original module code for", moduleName, ":\n", moduleCode);
      const processedModule = processCode(moduleCode, moduleName);
      console.log("[DEBUG] Processed module code for", moduleName, ":\n", processedModule);
      moduleContents.push({ name: moduleName, code: processedModule });
    }
  }
  console.log("[DEBUG] Final moduleContents:", moduleContents);

  // Process the main source code (removing relative import lines)
  const processedSource = processCode(source, "source");
  console.log("[DEBUG] Processed main source code:\n", processedSource);

  // Combine the processed modules and main source into one module script.
  let combinedCode = "";
  if (moduleContents.length > 0) {
    for (const mod of moduleContents) {
      combinedCode += `// Inlined module: ${mod.name}\n` + mod.code + "\n\n";
    }
  }
  combinedCode += "// Main Source\n" + processedSource;
  
  // Append an automatic call to report completion with DOM innerHTML
  combinedCode += `
// Automatically report completion after all rendering is complete
setTimeout(() => { 
  if (typeof _reportComplete === 'function') { 
    _reportComplete(window._getConsoleOutput ? window._getConsoleOutput() : ''); 
    console.log('Final DOM state captured and reported.'); 
  } 
}, 100);`;

  console.log("[DEBUG] Combined module and main source code:\n", combinedCode);

  // Add a utility script to easily access both the DOM and console output
  const utilityScript = `
// Add utility to print both DOM state and console output
window.reportCompleteStatus = function() {
  const output = window._getConsoleOutput ? window._getConsoleOutput() : '';
  const domState = document.documentElement.outerHTML;
  
  console.log('=== EXECUTION COMPLETE ===');
  console.log('Console output length:', output.length);
  console.log('DOM state length:', domState.length);
  
  if (typeof _reportComplete === 'function') {
    _reportComplete(output);
  }
  
  return {
    output: output,
    domState: domState
  };
};`;

  // Communication script (plain script) for capturing console output, DOM content, and errors.
  const comScript = `
// Setup communication
window._SANDBOX_ID = "${instanceId}";
console.log("[DEBUG] Communication script loaded with instanceId:", "${instanceId}");

function _reportToParent(type, data) {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ type, instanceId: "${instanceId}", ...data }, '*');
  } else if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type, instanceId: "${instanceId}", ...data }, '*');
  }
}

function _reportComplete(output) {
  console.log("[DEBUG] _reportComplete called to capture final application state");
  
  // Force any pending DOM updates to complete
  setTimeout(() => {
    // Capture the completely rendered DOM state
    const fullDomContent = document.documentElement.innerText;
    
    console.log("[DEBUG] Captured full rendered DOM state");
    
    // Send to opener if available; otherwise, to parent if it's a framed context.
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ 
        type: 'SANDBOX_COMPLETE', 
        instanceId: "${instanceId}", 
        output, 
        renderedDOM: fullDomContent
      }, '*');
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage({ 
        type: 'SANDBOX_COMPLETE', 
        instanceId: "${instanceId}", 
        output, 
        renderedDOM: fullDomContent
      }, '*');
    }
  }, 10); // Small delay to ensure all DOM updates are complete
}

function _reportError(error) {
  const errorMsg = error.message || String(error);
  console.error("[DEBUG] _reportError called:", errorMsg);
  
  // Capture the rendered DOM state at the time of error
  const renderedDOM = document.documentElement.outerHTML;
  
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage({ 
      type: 'SANDBOX_ERROR', 
      instanceId: "${instanceId}", 
      error: errorMsg,
      renderedDOM
    }, '*');
  } else if (window.parent && window.parent !== window) {
    window.parent.postMessage({ 
      type: 'SANDBOX_ERROR', 
      instanceId: "${instanceId}", 
      error: errorMsg,
      renderedDOM
    }, '*');
  }
}

(function() {
  // Console output capture
  let output = "";
  const originalConsole = { 
    log: console.log, 
    warn: console.warn, 
    error: console.error, 
    info: console.info, 
    debug: console.debug 
  };
  
  // Override all console methods to capture output
  Object.keys(originalConsole).forEach(method => {
    console[method] = function(...args) {
      // Format the arguments
      const formatted = args.map(arg => {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      
      // Add formatted output to our log accumulator
      output += '[' + method + '] ' + formatted + '\\n';
      
      // Update the visual output element if it exists
      const outputEl = document.getElementById('output');
      if (outputEl) {
        const line = document.createElement('div');
        line.className = method === 'error' ? 'error' : '';
        line.textContent = '[' + method + '] ' + formatted;
        outputEl.appendChild(line);
      }
      
      // Real-time reporting for visible windows
      _reportToParent('CONSOLE', { 
        method, 
        args: args.map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch (e) {
            return String(arg);
          }
        }),
        formatted 
      });
      
      // Also call the original console method
      originalConsole[method].apply(console, args);
    };
  });
  
  // Function to retrieve all accumulated console output
  window._getConsoleOutput = function() { 
    return output; 
  };
})();

window.addEventListener('error', function(event) {
  console.error('Uncaught error:', event.error || event.message);
  _reportError(event.error || event.message);
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  _reportError(event.reason);
});`;

  console.log("[DEBUG] Communication script defined.");

  // Execution: use visible window (window.open) or hidden iframe.
  if (visible) {
    return new Promise((resolve) => {
      console.log("[DEBUG] Visible execution mode: Opening new window...");
      const win = window.open('', '_blank', 'width=800,height=600');
      if (!win) {
        console.error("[DEBUG] Failed to open new window.");
        return resolve("Error: Could not open a new window. Please check your pop-up blocker settings.");
      }
      
      let output = "";
      let domContent = "";
      const messageHandler = (event) => {
        console.log("[DEBUG] Message received from window:", event.data);
        if (event.data?.instanceId === instanceId) {
          if (event.data.type === 'CONSOLE') {
            output += `[${event.data.method}] ${event.data.formatted}\n`;
          } else if (event.data.type === 'SANDBOX_COMPLETE') {
            console.log("[DEBUG] Received SANDBOX_COMPLETE message with rendered DOM state");
            domContent = event.data.renderedDOM || "";
            cleanup();
            resolve({
              output: event.data.output || output,
              renderedDOM: domContent
            });
          } else if (event.data.type === 'SANDBOX_ERROR') {
            console.error("[DEBUG] Received SANDBOX_ERROR message:", event.data);
            domContent = event.data.renderedDOM || "";
            cleanup();
            resolve({
              error: event.data.error, 
              output: output,
              renderedDOM: domContent
            });
          }
        }
      };
      window.addEventListener('message', messageHandler);
      const tid = setTimeout(() => {
        console.warn("[DEBUG] Execution timed out");
        
        if (!win.closed) { 
          // Try to capture final DOM state before closing
          try {
            domContent = win.document.documentElement.outerHTML;
          } catch (e) {
            console.error("[DEBUG] Could not capture DOM on timeout:", e);
          }
          win.close(); 
        }
        cleanup();
        resolve({
          error: `Timeout after ${timeout}ms`,
          output: output,
          renderedDOM: domContent
        });
      }, timeout);
      const cleanup = () => {
        clearTimeout(tid);
        window.removeEventListener('message', messageHandler);
      };
      
      console.log("[DEBUG] Writing HTML content to new window.");
      win.document.open();
      win.document.write(htmlContent);
      
      console.log("[DEBUG] Injecting communication script into new window.");
      const comScriptEl = win.document.createElement('script');
      comScriptEl.textContent = comScript;
      win.document.head.appendChild(comScriptEl);
      
      console.log("[DEBUG] Injecting utility script for DOM and console reporting");
      const utilScriptEl = win.document.createElement('script');
      utilScriptEl.textContent = utilityScript;
      win.document.head.appendChild(utilScriptEl);
      
      console.log("[DEBUG] Injecting combined module script into new window.");
      const moduleScriptEl = win.document.createElement('script');
      moduleScriptEl.setAttribute('type', 'module');
      moduleScriptEl.textContent = combinedCode;
      console.log("[DEBUG] Combined module script content:\n", combinedCode);
      win.document.body.appendChild(moduleScriptEl);
      
      win.document.close();
      win.document.title = html ? `Code: ${html}` : 'Code Execution';
      console.log("[DEBUG] New window setup complete with title:", win.document.title);
    });
  } else {
    console.log("[DEBUG] Invisible execution mode: Creating hidden iframe...");
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    document.body.appendChild(iframe);
    
    await new Promise(resolve => {
      iframe.onload = resolve;
      iframe.src = 'about:blank';
    });
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    console.log("[DEBUG] Iframe loaded. Writing HTML content to iframe.");
    
    return new Promise((resolve) => {
      const tid = setTimeout(() => {
        console.warn("[DEBUG] Iframe execution timed out");
        // Try to capture final DOM state before cleanup
        let domContent = "";
        try {
          domContent = iframe.contentDocument.documentElement.outerHTML;
        } catch (e) {
          console.error("[DEBUG] Could not capture iframe DOM on timeout:", e);
        }
        cleanup();
        resolve({
          error: `Timeout after ${timeout}ms`,
          output: output,
          renderedDOM: domContent
        });
      }, timeout);
      
      let output = "";
      let domContent = "";
      const messageHandler = (event) => {
        console.log("[DEBUG] Message received from iframe:", event.data);
        if (event.data?.instanceId === instanceId) {
          if (event.data.type === 'CONSOLE') {
            output += `[${event.data.method}] ${event.data.formatted}\n`;
          } else if (event.data.type === 'SANDBOX_COMPLETE') {
            console.log("[DEBUG] Iframe SANDBOX_COMPLETE received with rendered DOM state");
            domContent = event.data.renderedDOM || "";
            cleanup();
            resolve({
              output: event.data.output || output,
              renderedDOM: domContent
            });
          } else if (event.data.type === 'SANDBOX_ERROR') {
            console.error("[DEBUG] Iframe SANDBOX_ERROR received:", event.data);
            domContent = event.data.renderedDOM || "";
            cleanup();
            resolve({
              error: event.data.error,
              output: output,
              renderedDOM: domContent
            });
          }
        }
      };
      window.addEventListener('message', messageHandler);
      const cleanup = () => {
        clearTimeout(tid);
        window.removeEventListener('message', messageHandler);
        if (iframe.parentNode) { iframe.parentNode.removeChild(iframe); }
      };
      
      try {
        console.log("[DEBUG] Writing HTML to iframe document.");
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        console.log("[DEBUG] Injecting communication script into iframe.");
        const comScriptEl = iframeDoc.createElement('script');
        comScriptEl.textContent = comScript;
        iframeDoc.head.appendChild(comScriptEl);
        
        console.log("[DEBUG] Injecting utility script for DOM and console reporting");
        const utilScriptEl = iframeDoc.createElement('script');
        utilScriptEl.textContent = utilityScript;
        iframeDoc.head.appendChild(utilScriptEl);
        
        console.log("[DEBUG] Injecting combined module script into iframe.");
        const moduleScriptEl = iframeDoc.createElement('script');
        moduleScriptEl.setAttribute('type', 'module');
        moduleScriptEl.textContent = combinedCode;
        console.log("[DEBUG] Iframe combined module script content:\n", combinedCode);
        iframeDoc.body.appendChild(moduleScriptEl);
        iframeDoc.close();
        console.log("[DEBUG] Iframe document closed.");
      } catch (err) {
        console.error("[DEBUG] Error writing to iframe:", err);
        cleanup();
        resolve({
          error: `Error: ${err.message || String(err)}`,
          output: output,
          renderedDOM: ""
        });
      }
    });
  }
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
  const getFileContents = (file) => localStorage.getItem("file:" + file) || localStorage.setItem("file:" + file, "") || "";
  const filenames = new Array(localStorage.length).fill(0).map((_, i) => localStorage.key(i)).filter(e => e.startsWith('file:')).map(e => e.replace('file:', ''));
  const main = [
    "_profile.txt",
    "_memory.txt",
    "_workspace.txt",
    "_knowledge.txt",
    "_plan.txt",
    "_heuristics.txt",
  ].map((file) => ({ file, contents: getFileContents(file) }));
  main.push({filenames});
  main.push({important: customContext})
  main.push({description: "the filenames key contains the list of files. please review the items under 'important' carefully"})
  return { main: JSON.stringify(main, null, 2),time, language, platform, memory, hardwareConcurrency, timeFormat };
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
  const textChunks = await textSplitter.splitText(text.replace(/\n/g, ".").replace(/\.+/g, "."));
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

export function sanitizeHTML(inputHTML) {
  const doc = new DOMParser().parseFromString(inputHTML, "text/html");
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  doc.querySelectorAll("script, style, meta, link, head, iframe").forEach((el) => el.remove());
  doc.querySelectorAll("a").forEach((e) => (e.innerText = `[${normalize(e.innerText) || e.href}](${e.href})`));
  doc.querySelectorAll("img").forEach((e) => (e.outerHTML = `![${normalize(e.alt) || e.src}](${e.src})`));
  doc.querySelectorAll("ul li").forEach((e) => (e.innerText = `- ${normalize(e.innerText)}`));
  doc.querySelectorAll("ol li").forEach((e, i) => (e.innerText = `${i + 1}. ${normalize(e.innerText)}`));
  doc.querySelectorAll("hr").forEach((e) => (e.outerHTML = "---"));
  doc.querySelectorAll("blockquote").forEach((e) => {
    e.innerText = e.innerText
      .split(/\r?\n/)
      .map((line) => `> ${normalize(line)}`)
      .join("\n");
  });
  doc.querySelectorAll("code").forEach((e) => (e.innerText = "`" + normalize(e.innerText) + "`"));
  doc.querySelectorAll("pre").forEach((e) => (e.innerText = "```\n" + e.innerText + "\n```"));
  doc.querySelectorAll("strong, b").forEach((e) => (e.innerText = `**${normalize(e.innerText)}**`));
  doc.querySelectorAll("em, i").forEach((e) => (e.innerText = `*${normalize(e.innerText)}*`));
  doc.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((e) => {
    const level = parseInt(e.tagName.substring(1), 10);
    e.innerText = `${"#".repeat(level)} ${normalize(e.innerText)}`;
  });
  doc.querySelectorAll("table").forEach((table) => {
    let rows = [];
    table.querySelectorAll("tr").forEach((tr) => {
      let cells = Array.from(tr.querySelectorAll("th, td")).map((cell) => {
        // Remove a leading pipe if it exists (added earlier)
        let cellText = normalize(cell.innerText);
        if (cellText.startsWith("|")) {
          cellText = cellText.substring(1).trim();
        }
        return cellText;
      });
      if (cells.length > 0) {
        rows.push(`| ${cells.join(" | ")} |`);
      }
    });
    // If there's a header (i.e. a <th> in the table), add a divider after the first row.
    if (rows.length > 0 && table.querySelector("th")) {
      // Determine number of columns based on the first row
      let headerCells = table.querySelectorAll("tr:first-child th, tr:first-child td");
      let numColumns = headerCells.length;
      let divider = `| ${Array(numColumns).fill("---").join(" | ")} |`;
      rows.splice(1, 0, divider);
    }
    const markdownTable = rows.join("\n");
    table.parentNode.replaceChild(doc.createTextNode(markdownTable), table);
  });
  return doc.body.innerText
    .split(/\r?\n/)
    .map(normalize)
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
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
