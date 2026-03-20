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

export function formatDateInputForDisplay(value, locale) {
  const parsed = parseDateInput(value);
  return parsed ? parsed.toLocaleDateString(locale) : value || "";
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

export function formatUtcTimestampToLocal(value, locale, options) {
  const parsed = normalizeUtcTimestamp(value);
  return parsed ? parsed.toLocaleString(locale, options) : value || "";
}

export function formatUTCTimestampToLocalDate(value, locale, options) {
  const parsed = normalizeUtcTimestamp(value);
  return parsed ? parsed.toLocaleDateString(locale, options) : value || "";
}
