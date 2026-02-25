import { readFileSync } from "fs";
import { resolve, dirname } from "path";

/**
 * Parse a CSV string into an array of objects.
 * Handles quoted fields (with commas/newlines), JSON columns, null literal,
 * file: references, env: references, and numeric auto-casting.
 *
 * @param {string} content - Raw CSV string with header row
 * @param {Object} options
 * @param {string} [options.baseDir] - Base directory for resolving file: references
 * @returns {Object[]} Array of row objects keyed by header names
 */
export function parseCsv(content, options = {}) {
  const { baseDir } = options;
  const rows = parseRows(content);
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = castValue(row[i] ?? "", baseDir);
    }
    return obj;
  });
}

/**
 * Load and parse a CSV file. Resolves file: references relative to the CSV's directory.
 *
 * @param {string} filePath - Absolute path to CSV file
 * @param {Object} [options] - Additional parse options
 * @returns {Object[]} Array of row objects
 */
export function loadCsv(filePath, options = {}) {
  const content = readFileSync(filePath, "utf-8");
  return parseCsv(content, { baseDir: dirname(filePath), ...options });
}

/**
 * Split CSV content into rows of string arrays, respecting quoted fields.
 */
function parseRows(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\n" || (ch === "\r" && content[i + 1] === "\n")) {
        row.push(field);
        field = "";
        if (row.some((f) => f !== "")) rows.push(row);
        row = [];
        i += ch === "\r" ? 2 : 1;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field/row
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);

  return rows;
}

/**
 * Cast a raw CSV cell value to its appropriate JS type.
 * Supports: null, file:path, env:VAR, JSON objects/arrays, numbers, and plain strings.
 */
function castValue(raw, baseDir) {
  const trimmed = raw.trim();

  if (trimmed === "null") return null;

  if (trimmed.startsWith("file:") && baseDir) {
    const filePath = resolve(baseDir, trimmed.slice(5));
    return readFileSync(filePath, "utf-8");
  }

  if (trimmed.startsWith("env:")) {
    return process.env[trimmed.slice(4)] ?? null;
  }

  // JSON object or array
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 1) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  // Numeric
  if (trimmed !== "" && !isNaN(trimmed) && trimmed !== "true" && trimmed !== "false") {
    return Number(trimmed);
  }

  return trimmed;
}
