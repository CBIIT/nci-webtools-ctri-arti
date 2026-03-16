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

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function getDateRange(startDateParam, endDateParam) {
  const now = new Date();
  const start = startDateParam
    ? parseDateOnly(startDateParam) || new Date(startDateParam)
    : new Date(now);
  if (!startDateParam) start.setDate(start.getDate() - 30);
  start.setHours(0, 0, 0, 0);

  const end = endDateParam ? parseDateOnly(endDateParam) || new Date(endDateParam) : new Date(now);
  end.setHours(23, 59, 59, 999);

  return { startDate: start, endDate: end };
}
