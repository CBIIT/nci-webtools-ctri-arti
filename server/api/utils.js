import { inspect } from "util";

import forge from "node-forge";
import { readHttpRequestContext } from "shared/request-context.js";
import { createHttpError, getDateRange, routeHandler } from "shared/utils.js";

// Re-export search functions from shared
export { braveSearch, govSearch, search } from "shared/search.js";
export { createHttpError, getDateRange, routeHandler };

export const log = (value) =>
  console.log(inspect(value, { depth: null, colors: true, compact: false, breakLength: 120 }));

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

export function getRequestContext(req, { allowAnonymous = false, source = "server" } = {}) {
  return readHttpRequestContext(req, { allowAnonymous, source });
}

/**
 * Extracts the authenticated user ID from a request, or throws 401.
 * @param {import("express").Request} req
 * @returns {string} userId
 */
export function getUserId(req) {
  return getRequestContext(req).userId;
}

export function getAuthenticatedUser(req, options = {}) {
  const context = getRequestContext(req, options);
  const user = req.session?.user;
  if (!user || Number(user.id) !== Number(context.userId)) {
    throw createHttpError(401, "Authentication required");
  }
  return user;
}
