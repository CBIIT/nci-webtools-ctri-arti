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

export function parseUsageQuery(query = {}) {
  return {
    startDate: query.startDate,
    endDate: query.endDate,
    type: query.type,
    limit: query.limit ? +query.limit : undefined,
    offset: query.offset ? +query.offset : undefined,
  };
}

export function parseAnalyticsQuery(query = {}) {
  return {
    ...parseUsageQuery(query),
    groupBy: query.groupBy,
    userId: query.userId,
    search: query.search,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    role: query.role,
    status: query.status,
  };
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
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

const DEFAULT_TIME_ZONE = "America/New_York";

function isDateTimeWithoutZone(value) {
  return /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(value) && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function normalizeTimestampParam(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  if (isDateTimeWithoutZone(text)) {
    return `${text.replace(" ", "T")}Z`;
  }
  return text;
}

export function normalizeTimeZone(timeZone) {
  const candidate = String(timeZone || DEFAULT_TIME_ZONE).trim();

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

const timeZoneFormatterCache = new Map();

function getTimeZoneFormatter(timeZone) {
  if (!timeZoneFormatterCache.has(timeZone)) {
    timeZoneFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
    );
  }

  return timeZoneFormatterCache.get(timeZone);
}

function getTimeZoneParts(date, timeZone) {
  const formatter = getTimeZoneFormatter(timeZone);
  const values = {};

  for (const part of formatter.formatToParts(date)) {
    if (part.type === "literal") continue;
    values[part.type] = Number(part.value);
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function shiftCalendarDate({ year, month, day }, deltaDays) {
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getDatePartsInTimeZone(date, timeZone) {
  const { year, month, day } = getTimeZoneParts(date, timeZone);
  return { year, month, day };
}

function zonedDateTimeToUtc(
  dateParts,
  timeZone,
  { hour = 0, minute = 0, second = 0, millisecond = 0 } = {}
) {
  let guessMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    second,
    0
  );
  const targetWallClockMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    second,
    0
  );

  for (let iteration = 0; iteration < 4; iteration++) {
    const actual = getTimeZoneParts(new Date(guessMs), timeZone);
    const actualWallClockMs = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    const diffMs = targetWallClockMs - actualWallClockMs;

    if (diffMs === 0) {
      return new Date(guessMs + millisecond);
    }

    guessMs += diffMs;
  }

  return new Date(guessMs + millisecond);
}

function buildDateOnlyRange(dateParts, timeZone) {
  return {
    startDate: zonedDateTimeToUtc(dateParts, timeZone, {
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    }),
    endDate: zonedDateTimeToUtc(dateParts, timeZone, {
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    }),
  };
}

function parseDateParam(value, timeZone) {
  const dateOnly = parseDateOnly(value);
  if (dateOnly) {
    return {
      ...buildDateOnlyRange(dateOnly, timeZone),
      isDateOnly: true,
    };
  }

  const parsed = new Date(normalizeTimestampParam(value));
  return { startDate: parsed, endDate: parsed, isDateOnly: false };
}

export function getDateRange(startDateParam, endDateParam, timeZone) {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const now = new Date();
  const todayParts = getDatePartsInTimeZone(now, resolvedTimeZone);
  const defaultStartParts = shiftCalendarDate(todayParts, -30);

  const start = startDateParam
    ? parseDateParam(startDateParam, resolvedTimeZone)
    : { ...buildDateOnlyRange(defaultStartParts, resolvedTimeZone), isDateOnly: true };
  const end = endDateParam
    ? parseDateParam(endDateParam, resolvedTimeZone)
    : { ...buildDateOnlyRange(todayParts, resolvedTimeZone), isDateOnly: true };

  return {
    startDate: start.startDate,
    endDate: end.isDateOnly ? end.endDate : end.startDate,
    timeZone: resolvedTimeZone,
  };
}
