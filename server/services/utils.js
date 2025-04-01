import { inspect } from "util";
import { getSession } from "./browser.js";

export const log = (value) => console.log(inspect(value, { depth: null, colors: true, compact: false, breakLength: 120 }));

async function fetchJson(url, opts = {}) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      ...opts.headers,
    },
    ...opts,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * @param {Object} opts - Search options (q, count, offset, freshness, goggles)
 * @param {string} apiKey - Brave Search API key
 */
export async function braveSearch(opts, apiKey = process.env.BRAVE_SEARCH_API_KEY) {
  for (let key in opts) {
    if (opts[key] === undefined) {
      delete opts[key];
    }
  }

  // don't parallelize requests to avoid rate limiting
  const results = {};
  for await (const key of ["web", "news"]) {
    const url = `https://api.search.brave.com/res/v1/${key}/search?${new URLSearchParams(opts)}`;
    results[key] = await fetchJson(url, {headers: {"X-Subscription-Token": apiKey}});
  }

  if (results.web.summarizer) {
    const opts = results.web.summarizer;
    const summarizerUrl = `https://api.search.brave.com/res/v1/summarizer/search?${new URLSearchParams(opts)}`;
    results.summary = await fetchJson(summarizerUrl,  {headers: {"X-Subscription-Token": apiKey}});
  }

  return results;
}


export async function govSearch(opts, key = process.env.DATA_GOV_API_KEY) {
  const url = "https://api.govinfo.gov/search?" + new URLSearchParams({ api_key: key });
  const body = {
    query: opts.q,
    pageSize: opts.count || 20,
    offsetMark: opts.offset || "*",
    sorts: [
      {
        field: "score",
        sortOrder: "DESC",
      },
      {
        field: "lastModified",
        sortOrder: "DESC",
      },
    ],
    historical: opts.historical || false,
    resultLevel: opts.resultLevel || "default",
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    return [{ results: [], error: `HTTP ${response.status}: ${response.statusText} ${errorText}` }];
  }
  return await response.json();
}

export async function search(opts) {
  const results = await braveSearch(opts);
  results.gov = await govSearch(opts);
  return results;
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
 * Renders HTML content from a URL. If the content type is not HTML, it returns false.
 * 
 * @param {string} url - The URL to fetch and render.
 * @param {string} id - The session ID for the Puppeteer session.
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @return {Promise<string|undefined>} - Returns the rendered HTML content or undefined if not HTML.
 */
export async function renderHtml(url, id, timeout = 10000) {
  const contentType = await fetch(url, { method: "HEAD" })
    .then((response) => response.headers.get("content-type"))
    .catch(() => null);

  if (!contentType?.includes("text/html")) {
    return undefined;
  }

  const response = await fetch(url);
  let html = await response.text();

  if (needsRendering(html)) {
    const session = await getSession(id);
    await session.page.goto(url, { waitUntil: "networkidle2", timeout });
    html = await session.page.content();
  }

  return html;
}

/**
 * Function to determine if HTML likely needs client-side rendering.
 *
 * @param {string} html - The HTML content to analyze.
 * @param {object} [options] - Optional configuration.
 * @param {number} [options.minHtmlLength=100] - Minimum HTML length to process.
 * @param {number} [options.minInlineScriptLength=5000] - Threshold for inline JS size.
 * @return {boolean} - Returns true if the page likely needs client-side rendering.
 */
export function needsRendering(html, options = {}) {
  const minHtmlLength = options.minHtmlLength ?? 100;
  const minInlineScriptLength = options.minInlineScriptLength ?? 5000;

  if (!html || typeof html !== "string" || html.length < minHtmlLength) {
    return false;
  }

  const htmlLower = html.toLowerCase();

  // keywords indicating frameworks, tools, hydration, or complex JS behavior
  const csrKeywords = [
    // Frameworks/Libs
    "react",
    "angular",
    "vue",
    "svelte",
    "ember",
    "jquery",
    "next",
    "nuxt",
    // Build tools"webpack",
    "vite",
    "parcel",
    // Common attributes/prefixes"ng-",
    "v-",
    "data-react",
    "data-v-",
    "data-svelte",
    // Common data embedding patterns"__state__",
    "__data__",
    "__props__",
    // Script type for data islands
    "application/json",
    // DOM manipulation hints
    "document.get",
    "document.query",
    ".innerhtml",
    ".append",
    // Data fetching hints
    "fetch",
    "xmlhttprequest",
    "/api/",
    "graphql",
    // Routing hints
    "history.",
    "route",
    "hashchange",
    // Async patterns
    "async ",
    "await ",
    ".then(",
    // Keywords often used in framework contexts
    "interactive",
    "hydrate",
    "render",
  ];
  if (csrKeywords.some((keyword) => htmlLower.includes(keyword))) {
    return true;
  }

  // script tags modules, external bundles, or significant inline code
  const scriptTags = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  let totalInlineScriptSize = 0;
  const externalBundleOrFrameworkPatterns = [
    /bundle|chunk|app|main|vendor|entry|index|runtime|poly/i, // Common bundle filenames
    /\.(hash|chunkhash)\./i, // Hashed filenames
    /\/react|\/vue|\/angular|\/svelte|\/next|\/nuxt/i, // Framework names in path
  ];

  for (const scriptTag of scriptTags) {
    if (scriptTag.includes('type="module"') || scriptTag.includes("type='module'")) {
      return true;
    }

    const srcMatch = scriptTag.match(/src\s*=\s*['"]([^'"]+)['"]/i);
    if (srcMatch?.[1]) {
      // Check external script source
      if (externalBundleOrFrameworkPatterns.some((pattern) => pattern.test(srcMatch[1]))) {
        return true;
      }
    } else {
      // Accumulate size of inline scripts
      const contentMatch = scriptTag.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      totalInlineScriptSize += contentMatch?.[1]?.trim()?.length || 0;
    }
  }

  // Significant amount of inline JS often indicates rendering logic
  if (totalInlineScriptSize > minInlineScriptLength) {
    return true;
  }

  // Check for custom element tags (web components) or common empty root divs
  if (/<[a-z]+-[a-z][^>]*>/i.test(html) || /<div[^>]*id=(['"])(app|root|main)\1[^>]*>\s*<\/div>/i.test(htmlLower)) {
    return true;
  }

  // Check meta generator tag for known CSR/SSG frameworks
  const generatorMatch = htmlLower.match(/<meta\s+name=["']generator["']\s+content=["']([^"']+)["']/i);
  if (
    generatorMatch?.[1]?.includes("next") || // Simplified check for common ones
    generatorMatch?.[1]?.includes("nuxt") ||
    generatorMatch?.[1]?.includes("sveltekit")
  ) {
    return true;
  }

  // If none of the above indicators triggered, assume it doesn't need rendering
  return false;
}
