import { reportErrorToServer } from "./error-reporter.js";

/**
 * Registry of additional data collectors for error reporting.
 */
const additionalDataCollectors = new Map();

/**
 * Register a collector function for additional error data.
 *
 * @param {string} key - Unique identifier for the collector
 * @param {function} collector - Async function that returns additional context data
 */
export function registerErrorDataCollector(key, collector) {
  additionalDataCollectors.set(key, collector);
}

/**
 * Unregister a collector function.
 *
 * @param {string} key - Unique identifier for the collector
 */
export function unregisterErrorDataCollector(key) {
  additionalDataCollectors.delete(key);
}

/**
 * Collect additional data from all registered collectors.
 *
 * @returns {Promise<object>} - Combined additional data from all collectors
 */
async function collectAllAdditionalData() {
  const additionalData = {};

  for (const [key, collector] of additionalDataCollectors) {
    try {
      const data = typeof collector === "function" ? await collector() : collector;
      if (data && typeof data === "object") {
        Object.assign(additionalData, data);
      }
    } catch (err) {
      console.error(`Failed to collect additional error data from "${key}":`, err);
    }
  }

  return Object.keys(additionalData).length > 0 ? additionalData : null;
}

/**
 * Global error handler for uncaught errors and unhandled promise rejections.
 */
async function handleGlobalError(event) {
  const error = event.error || event.reason || event;
  const isPromiseRejection = event.type === "unhandledrejection";

  const additionalData = await collectAllAdditionalData();

  reportErrorToServer({
    message: error?.message || String(error) || "Unknown error",
    stack: error?.stack,
    errorType: isPromiseRejection ? "Unhandled Promise Rejection" : "Uncaught Error",
    reportSource: "Automatic",
    additionalData,
  });
}

window.addEventListener("error", handleGlobalError);
window.addEventListener("unhandledrejection", handleGlobalError);
