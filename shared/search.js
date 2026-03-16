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
    results.summary = await fetchJson(summarizerUrl, {
      headers: { "X-Subscription-Token": apiKey },
    });
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
      Accept: "application/json",
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
