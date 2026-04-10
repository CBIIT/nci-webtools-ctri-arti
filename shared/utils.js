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

/**
 * Creates an error with a status code and optional error code / cause.
 * This is the standard error factory for all backend services.
 *
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {object} [options] - Optional code and cause
 * @param {string} [options.code] - Machine-readable error code
 * @param {Error}  [options.cause] - Underlying cause
 * @returns {Error} Error with .statusCode (and optionally .code / .cause)
 */
export function createAppError(statusCode, message, { code, cause } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (cause) error.cause = cause;
  return error;
}

export function createNotFoundError(message) {
  return createAppError(404, message);
}

export function createValidationError(message) {
  return createAppError(400, message);
}

export function createForbiddenError(message) {
  return createAppError(403, message);
}

export function sendNotFound(res, label) {
  return res.status(404).json({ error: `${label} not found` });
}

export function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function getMutationCount(result) {
  return result?.length ?? result?.rowCount ?? result?.affectedRows ?? result?.changes ?? 0;
}

export function validateConversationMessage(role, content) {
  if (!Array.isArray(content)) {
    throw createValidationError("Message content must be an array");
  }

  let hasToolUse = false;
  let hasToolResult = false;
  for (const block of content) {
    if (block?.toolUse) hasToolUse = true;
    if (block?.toolResult) hasToolResult = true;
  }

  if (hasToolUse && hasToolResult) {
    throw createValidationError("A single message cannot contain both tool uses and tool results");
  }
  if (role === "user" && hasToolUse) {
    throw createValidationError("User messages cannot contain tool uses");
  }
  if (role === "assistant" && hasToolResult) {
    throw createValidationError("Assistant messages cannot contain tool results");
  }
}

/**
 * Streams an async iterable as NDJSON (newline-delimited JSON) to an Express response.
 *
 * @param {import("express").Response} res - Express response
 * @param {AsyncIterable} stream - Async iterable of objects to serialize
 * @param {object} [options]
 * @param {function} [options.onWriteError] - Called with (error) on per-write failures
 * @param {boolean} [options.end=true] - Whether to call res.end() after the stream
 */
export async function streamNdjsonResponse(res, stream, { onWriteError, end = true } = {}) {
  for await (const message of stream) {
    try {
      res.write(JSON.stringify(message) + "\n");
    } catch (error) {
      if (onWriteError) onWriteError(error);
    }
  }
  if (end) res.end();
}

function parseDateOnly(value) {
  return /^(\d{4})-(\d{2})-(\d{2})$/.test(value);
}

function normalizeTimestampParam(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  // Treat bare datetime strings (no Z or offset) as UTC
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(text) && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    return `${text.replace(" ", "T")}Z`;
  }
  return text;
}

function parseDateParam(value) {
  if (parseDateOnly(value)) {
    return {
      startDate: new Date(`${value}T00:00:00.000Z`),
      endDate: new Date(`${value}T23:59:59.999Z`),
      isDateOnly: true,
    };
  }

  const parsed = new Date(normalizeTimestampParam(value));
  return { startDate: parsed, endDate: parsed, isDateOnly: false };
}

/**
 * Computes a UTC date range from optional start/end parameters.
 * Date-only strings ("YYYY-MM-DD") expand to UTC midnight–23:59:59.999.
 * Full ISO timestamps are used as-is. Defaults to the last 30 UTC days.
 *
 * @param {string} [startDateParam]
 * @param {string} [endDateParam]
 * @returns {{ startDate: Date, endDate: Date }}
 */
export function getDateRange(startDateParam, endDateParam) {
  const now = new Date();

  if (!startDateParam) {
    const defaultStart = new Date(now);
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 30);
    defaultStart.setUTCHours(0, 0, 0, 0);
    startDateParam = defaultStart.toISOString().slice(0, 10);
  }
  if (!endDateParam) {
    endDateParam = now.toISOString().slice(0, 10);
  }

  const start = parseDateParam(startDateParam);
  const end = parseDateParam(endDateParam);

  return {
    startDate: start.startDate,
    endDate: end.isDateOnly ? end.endDate : end.startDate,
  };
}
