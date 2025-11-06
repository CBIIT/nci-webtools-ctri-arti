import { parseDocument } from "./parsers.js";

/**
 * Reads a fetch response body as an async generator of chunks
 * @param {Response} response - The fetch Response object to read
 * @yields {Uint8Array} Binary chunks from the response stream
 * @returns {AsyncGenerator<Uint8Array>} An async generator yielding binary chunks
 */
export async function* readStream(response) {
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Reads a file as text, arrayBuffer, or dataURL
 * @param {File} file
 * @param {string} type
 * @returns {Promise<string|ArrayBuffer>} - The file content
 */
export async function readFile(file, type = "text") {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    if (type === "arrayBuffer") reader.readAsArrayBuffer(file);
    else if (type === "dataURL") reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

/**
 * Converts array of objects to CSV format
 * @param {Array} data - Array of objects to convert
 * @param {Array|null} headers - Optional custom headers array
 * @returns {string} - CSV formatted string
 */
export function toCsv(data = [], headers = null) {
  headers ||= Object.keys(data?.[0] || {});
  const serialize = (value) =>
    String(value || "").includes(",") ? `"${value}"` : String(value || "");
  const rows = data.map((row) => headers.map((field) => row[field]));
  const csv = [headers].concat(rows).map((row) => row.map(serialize).join(","));
  return csv.join("\n");
}

/**
 * Downloads text content as a file
 * @param {string} filename - Name of the file to download
 * @param {string} text - Text content to download
 */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  downloadBlob(filename, blob);
}

/**
 * Downloads JSON object as a file
 * @param {string} filename - Name of the file to download
 * @param {any} json - JSON object to download
 */
export function downloadJson(filename, json) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  downloadBlob(filename, blob);
}

/**
 * Downloads CSV data as a file
 * @param {string} filename - Name of the file to download
 * @param {Array} csv - Array of objects to convert to CSV and download
 */
export function downloadCsv(filename, csv) {
  const blob = new Blob([toCsv(csv)], { type: "text/csv" });
  downloadBlob(filename, blob);
}

/**
 * Downloads a blob as a file
 * @param {string} filename - Name of the file to download
 * @param {Blob} blob - Blob to download
 */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Creates a timestamp string in the format YYYY-MM-DD_HH-MM-SS
 *
 * @returns {string} - The formatted timestamp
 */
export function createTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

// Re-export parseDocument for convenience
export { parseDocument };
