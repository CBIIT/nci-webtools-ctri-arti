import { inspect } from "util";

export const log = (value) => console.log(inspect(value, { depth: null, colors: true, compact: false, breakLength: 120 }));

async function braveRequest(url, opts = {}, apiKey = process.env.BRAVE_SEARCH_API_KEY) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": apiKey,
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
  Object.assign(opts, {
    summary: false,
    extra_snippets: false,
  });

  const newsUrl = `https://api.search.brave.com/res/v1/news/search?${new URLSearchParams(opts)}`;
  const news = await braveRequest(newsUrl);

  const searchUrl = `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams(opts)}`;
  const search = await braveRequest(searchUrl);

  if (search.summarizer) {
    const opts = { key: search.summarizer.key };
    const summarizerUrl = `https://api.search.brave.com/res/v1/summarizer/search?${new URLSearchParams(opts)}`;
    data.summary = await braveRequest(summarizerUrl);
  }

  return {
    news,
    search,
  };
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
