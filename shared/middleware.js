import logger, { formatObject } from "./logger.js";

/**
 * Logs requests
 * @param {function} formatter
 * @returns (request, response, next) => void
 */
export function logRequests(formatter = (request) => [request.path]) {
  return (request, response, next) => {
    request.startTime = new Date().getTime();
    logger.info(formatter(request));
    next();
  };
}

/**
 * Logs errors (should be used as the last middleware)
 * Shared version — logs only, no email. Server wraps this to add email sending.
 * @param {function} formatter
 * @returns (error, request, response, next) => void
 */
export function logErrors(formatter = (e) => ({ error: e.message })) {
  return (error, request, response, _next) => {
    const fullErrorMessage = `${formatObject(error.message)}.\n${formatObject(error.additionalError)}`;
    logger.error(fullErrorMessage);
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
