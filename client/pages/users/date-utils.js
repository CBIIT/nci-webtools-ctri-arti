import { VALID_DATE_RANGES, DEFAULT_TIMEZONE, LOCALES } from "../constants.js";

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

// Format a local calendar date as YYYY-MM-DD without converting to UTC.
export function formatDate(date) {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1), padDatePart(date.getDate())].join(
    "-"
  );
}

export function parseDateInput(value) {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** `yyyy-MM-dd` from `<input type="date">` as local calendar day → UTC ISO (local start-of-day). */
export function localDateInputToUtcStartIso(ymd) {
  const date = parseDateInput(ymd);
  if (!date) return "";
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/** `yyyy-MM-dd` from `<input type="date">` as local calendar day → UTC ISO (local end-of-day). */
export function localDateInputToUtcEndIso(ymd) {
  const date = parseDateInput(ymd);
  if (!date) return "";
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

export function formatDateInputForDisplay(value, locale) {
  const parsed = parseDateInput(value);
  return parsed ? parsed.toLocaleDateString(locale) : value || "";
}

/** Leading calendar date `yyyy-MM-dd` from a timestamp or date-only string; empty if no valid prefix. */
export function normalizeLocalTimestamp(value) {
  if (value == null || value === "") return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value).trim());
  return m ? m[1] : "";
}

export function normalizeUtcTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(text);
  const normalized = hasTimezone ? text : `${text.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// For full ISO timestamps, uses the viewer's local calendar date — not the UTC yyyy-MM-dd prefix (end-of-day) as backend APIs only accept UTC timestamps
export function toDateInputValue(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = normalizeUtcTimestamp(text);
  if (parsed && !Number.isNaN(parsed.getTime())) return formatDate(parsed);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return m ? m[1] : "";
}

export function formatUtcTimestampToDefaultTimezone(value) {
  const parsed = normalizeUtcTimestamp(value);
  return parsed
    ? parsed.toLocaleString(LOCALES.en_US, { timeZone: DEFAULT_TIMEZONE })
    : value || "";
}

export function formatUtcTimestampToLocal(value, locale, options) {
  const parsed = normalizeUtcTimestamp(value);
  return parsed ? parsed.toLocaleString(locale, options) : value || "";
}

export function formatUTCTimestampToLocalDate(value, locale, options) {
  const parsed = normalizeUtcTimestamp(value);
  return parsed ? parsed.toLocaleDateString(locale, options) : value || "";
}

// Calculate date range from preset
export function calculateDateRange(preset) {
  const now = new Date();
  let startDate, endDate;

  switch (preset) {
    case "Last 30 Days": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "Last 60 Days": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 60);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "Last 120 Days": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 120);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case "Last 360 Days": {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 360);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    default: {
      startDate = new Date(now);
      const day = startDate.getDay();
      const diff = day;
      startDate.setDate(startDate.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
    }
  }

  endDate = new Date(now);
  endDate.setHours(23, 59, 59, 999);

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

// Validate date range from URL params
export function validateDateRange(dateRange, defaultRange = VALID_DATE_RANGES[0]) {
  return VALID_DATE_RANGES.includes(dateRange) ? dateRange : defaultRange;
}

// Get default start date (30 days ago) in ISO string format
export function getDefaultStartDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString();
}
