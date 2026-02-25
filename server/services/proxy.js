import { Readable } from "stream";

import { createHttpError } from "./utils.js";

export const WHITELIST = [/.*/i];

/**
 * Proxy Middleware that handles requests to external URLs.
 * It validates the URL, checks against a whitelist, and forwards the request.
 * It also handles the response and streams it back to the client.
 */
export async function proxyMiddleware(req, res, next) {
  const { headers, method, body, query } = req;
  const host = headers.host?.split(":")[0];
  let urlString = req.path.replace(/^\/[^/]+\/?/, ""); // remove path prefix
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = "https://" + urlString;
  }
  let url = new URL(urlString);
  for (const key in query) {
    url.searchParams.set(key, query[key]);
  }
  // Only allow requests if the hostname matches or is on the whitelist
  if (!WHITELIST.some((regex) => regex.test(url.hostname)) && url.hostname !== host) {
    res.status(403).send("Forbidden: Domain not allowed");
    return;
  }

  try {
    // remove problematic headers
    const normalizedHeaders = { ...headers, ...getAuthorizedHeaders(url) };
    const normalizedBody =
      headers["content-type"] === "application/json" ? JSON.stringify(body) : body;
    ["host", "connection", "content-length"].forEach((h) => delete normalizedHeaders[h]);
    const response = await fetch(getAuthorizedUrl(url), {
      method,
      headers: normalizedHeaders,
      body: normalizedBody,
      redirect: "follow",
    });
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "");
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    next(createHttpError(500, error, error.message));
  }
}

export function getAuthorizedUrl(url, env = process.env) {
  const params =
    {
      "api.govinfo.gov": { api_key: env.DATA_GOV_API_KEY },
      "api.congress.gov": { api_key: env.CONGRESS_GOV_API_KEY },
    }[url.hostname] || {};
  for (const key in params) {
    url.searchParams.set(key, params[key]);
  }
  return url.toString();
}

export function getAuthorizedHeaders(url, env = process.env) {
  return (
    {
      "api.search.brave.com": { "x-subscription-token": env.BRAVE_SEARCH_API_KEY },
    }[url.hostname] || {}
  );
}
