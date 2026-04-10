import logger, { formatObject } from "./logger.js";

/**
 * Logs requests
 * @param {function} formatter
 * @returns (request, response, next) => void
 */
function getLoggedRequestPath(request) {
  const baseUrl = request.baseUrl || "";
  const path = request.path || "";
  return `${baseUrl}${path}` || request.originalUrl || "/";
}

export function logRequests(formatter = (request) => [getLoggedRequestPath(request)]) {
  return (request, response, next) => {
    request.startTime = new Date().getTime();
    logger.info(formatter(request));
    next();
  };
}

/**
 * Logs errors (should be used as the last middleware).
 * Accepts an optional onError callback for service-specific side effects (e.g., email reporting).
 *
 * @param {object|function} [options] - Options object, or a formatter function for backward compat
 * @param {function} [options.formatter] - Formats the JSON response body (default: { error: e.message })
 * @param {function} [options.onError]  - Called with (error, request) after logging, before responding
 * @returns Express error middleware (error, request, response, next) => void
 */
export function logErrors(options = {}) {
  const { formatter = (e) => ({ error: e.message }), onError } =
    typeof options === "function" ? { formatter: options } : options;

  return (error, request, response, _next) => {
    const cause = error.cause?.message ?? error.cause ?? "";
    const fullErrorMessage = `${formatObject(error.message)}.\n${formatObject(error.additionalError)}${cause ? `\nCaused by: ${formatObject(cause)}` : ""}`;
    logger.error(fullErrorMessage);
    if (onError) onError(error, request, fullErrorMessage);
    response.status(error.statusCode || 400).json(formatter(error));
  };
}

export function nocache(req, res, next) {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, private",
    Expires: "0",
    Pragma: "no-cache",
    "Surrogate-Control": "no-store",
    Vary: "*",
  });
  next();
}

export function securityHeaders(req, res, next) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
  };

  if (req.secure) {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
  }

  res.set(headers);
  next();
}
