import { Readable } from "stream";
import puppeteer from "puppeteer";

export const WHITELIST = [/.*/i];
export const PROXY_ENDPOINT = "/api/proxy";

/**
 * Returns 401 if the user is not authenticated
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 */
export async function authMiddleware(req, res, next) {
    // todo: switch over when keys are verified
  const authDisabled = true;
  if (!authDisabled && !req.user) {
    return res.status(401).end("Unauthorized");
  }
  next();
}

/**
 * Initializes a Puppeteer browser instance under app.locals
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 */
export async function browserMiddleware(req, res, next) {
  const { locals } = req.app;
  if (!locals.browser) {
    locals.browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--no-zygote"],
      protocolTimeout: 240_000,
    });
    locals.browser.on("disconnected", () => (locals.browser = null));
  }
  next();
}

/**
 * Proxy Middleware that handles requests to external URLs.
 * It validates the URL, checks against a whitelist, and forwards the request.
 * It also handles the response and streams it back to the client.
 * @param {Express.Request} req
 * @param {Express.Response} res
 * @param {Function} next
 * @returns
 */
export async function proxyMiddleware(req, res, next) {
  const { headers, method, body } = req;
  const host = headers.host?.split(":")[0];

  // Extract URL from path parameters
  let urlString = "";
  let params = { ...req.params, ...req.query, ...req.body };
  if (params && params.url) {
    urlString = Array.isArray(params.url) ? params.url.filter(Boolean).join("/") : params.url;

    // Add protocol if missing
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = "https://" + urlString;
    }
  }

  if (!urlString) {
    res.status(400).send("Bad Request: No URL provided");
    return;
  }

  let url;
  try {
    url = new URL(urlString);
  } catch (error) {
    res.status(400).send(`Invalid URL: ${error.message}`);
    return;
  }

  // Only allow requests if the hostname matches or is on the whitelist
  if (!WHITELIST.some((regex) => regex.test(url.hostname)) && url.hostname !== host) {
    res.status(403).send("Forbidden: Domain not allowed");
    return;
  }

  try {
    // remove problematic headers
    const cleanHeaders = { ...headers };
    ["host", "connection", "content-length"].forEach((h) => delete cleanHeaders[h]);
    const response = await fetch(getAuthorizedUrl(url), {
      method,
      headers: cleanHeaders,
      body,
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
    console.error("Proxy error:", error);
    res.status(500).send(`Proxy error: ${error.message}`);
  }
}

export function getAuthorizedUrl(url, env = process.env) {
  const key = {
    "api.govinfo.gov": env.DATA_GOV_API_KEY,
    "api.congress.gov": env.CONGRESS_GOV_API_KEY,
  }[url.hostname];
  key && url.searchParams.append("api_key", key);
  return url.toString();
}
