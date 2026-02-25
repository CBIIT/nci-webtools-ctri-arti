import { inspect } from "util";

import forge from "node-forge";

export const log = (value) =>
  console.log(inspect(value, { depth: null, colors: true, compact: false, breakLength: 120 }));

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

/**
 * Creates a self-signed certificate and private key
 * @param {any} opts - Options for certificate generation
 * @returns {{key: string, cert: string}}
 */
export function createCertificate(opts = {}) {
  const pki = forge.pki;
  const { attrs: customAttrs = {}, keySize = 2048, days = 365, altNames } = opts;

  // Attributes & Key Pair
  const defaultAttrs = { C: "US", ST: "State", L: "City", O: "Organization", CN: "localhost" };
  const finalAttrsMap = { ...defaultAttrs, ...customAttrs };
  const subject = Object.entries(finalAttrsMap).map(([shortName, value]) => ({ shortName, value }));
  const keys = pki.rsa.generateKeyPair({ bits: keySize });

  // Certificate Setup
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(19)); // Ensures positive hex serial
  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime()); // Use new Date instance
  cert.validity.notAfter = new Date(now.getTime());
  cert.validity.notAfter.setFullYear(now.getFullYear() + days);

  cert.setSubject(subject);
  cert.setIssuer(subject); // Self-signed

  // Extensions (Basic + SAN)
  const cnValue = finalAttrsMap.CN;
  const sanToAdd =
    altNames && altNames.length > 0
      ? altNames
      : cnValue === "localhost"
        ? [
            { type: 2, value: "localhost" },
            { type: 7, ip: "127.0.0.1" },
          ]
        : [];

  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
    },
    ...(sanToAdd.length > 0 ? [{ name: "subjectAltName", altNames: sanToAdd }] : []),
  ]);

  // Sign & PEM Output
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const privateKeyPem = pki.privateKeyToPem(keys.privateKey);
  const certPem = pki.certificateToPem(cert);
  return { key: privateKeyPem, cert: certPem };
}

export function getDateRange(startDateParam, endDateParam) {
  const now = new Date();

  const startDate = startDateParam
    ? new Date(new Date(startDateParam).setHours(0, 0, 0, 0))
    : new Date(new Date(now).setDate(now.getDate() - 30)).setHours(0, 0, 0, 0);

  const endDate = endDateParam
    ? new Date(new Date(endDateParam).setHours(23, 59, 59, 999))
    : new Date(new Date(now).setHours(23, 59, 59, 999));

  return { startDate: new Date(startDate), endDate: new Date(endDate) };
}

/**
 * Wraps an async Express route handler with automatic error forwarding.
 * Eliminates repetitive try/catch/next boilerplate in route definitions.
 *
 * @param {Function} fn - Async function (req, res, next) => Promise<void>
 * @returns {Function} Express middleware that catches errors and forwards them via next()
 */
export function routeHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Creates an error with a custom status code and user-friendly message,
 * while preserving the original error details.
 *
 * @param {number} statusCode - HTTP status code (e.g., 500, 400)
 * @param {Error|string} error - Original error or error message
 * @param {string} userMessage - User-friendly message to display
 * @returns {Error} Enhanced error object
 */
export function createHttpError(statusCode, error, userMessage) {
  const err = error instanceof Error ? error : new Error(error);
  err.statusCode = statusCode;
  err.additionalError = err.message;
  err.message = userMessage || err.message;
  return err;
}
