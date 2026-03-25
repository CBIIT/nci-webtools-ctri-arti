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

function parseDateParam(value) {
  const dateOnly = parseDateOnly(value);
  if (dateOnly) return { date: dateOnly, isDateOnly: true };

  const parsed = new Date(value);
  return { date: parsed, isDateOnly: false };
}

export function getDateRange(startDateParam, endDateParam) {
  const now = new Date();
  const start = startDateParam ? parseDateParam(startDateParam) : { date: new Date(now), isDateOnly: true };
  if (!startDateParam) start.date.setDate(start.date.getDate() - 30);
  if (start.isDateOnly) start.date.setHours(0, 0, 0, 0);

  const end = endDateParam ? parseDateParam(endDateParam) : { date: new Date(now), isDateOnly: true };
  if (end.isDateOnly) end.date.setHours(23, 59, 59, 999);

  return { startDate: start.date, endDate: end.date };
}
