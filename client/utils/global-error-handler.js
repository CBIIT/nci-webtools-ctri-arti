import { reportErrorToServer } from "./error-reporter.js";

/**
 * Global error handler for uncaught errors and unhandled promise rejections.
 */
function handleGlobalError(event) {
  const error = event.error || event.reason || event;
  const isPromiseRejection = event.type === "unhandledrejection";

  reportErrorToServer({
    message: error?.message || String(error) || "Unknown error",
    stack: error?.stack,
    errorType: isPromiseRejection ? "Unhandled Promise Rejection" : "Uncaught Error",
    reportSource: "Automatic",
  });
}

window.addEventListener("error", handleGlobalError);
window.addEventListener("unhandledrejection", handleGlobalError);
