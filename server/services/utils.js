import { inspect } from "util";

export const log = (value) => console.log(inspect(value, { depth: null, colors: true, compact: false, breakLength: 120 }));

async function fetchJson(url, opts = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
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
    results[key] = await fetchJson(url, { headers: { "X-Subscription-Token": apiKey } });
  }

  if (results.web.summarizer) {
    const opts = results.web.summarizer;
    const summarizerUrl = `https://api.search.brave.com/res/v1/summarizer/search?${new URLSearchParams(opts)}`;
    results.summary = await fetchJson(summarizerUrl, { headers: { "X-Subscription-Token": apiKey } });
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
 * @param {Function} fn - Async function to retry
 * @param {number} maxAttempts - Maximum number of retry attempts
 * @param {number} initialDelay - Initial delay in milliseconds
 * @returns {Promise<any>} - Result of the function execution
 * @throws {Error} - Throws the last error encountered after all retries are exhausted
 */
export async function retry(fn, maxAttempts = 3, initialDelay = 0) {
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

  throw new Error(`Failed after ${maxAttempts} attempts. Last error: ${lastError?.message}`);
}
