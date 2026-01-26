/**
 * Reports an error to the server logging API.
 *
 * @param {object} options
 * @param {string} options.message - Error message
 * @param {string} options.stack - Error stack trace
 * @param {string} options.code - Error code
 * @param {string} options.errorType - Type of error (e.g., "Uncaught Error", "Unhandled Promise Rejection")
 * @param {string} options.reportSource - Source of report (e.g., "User", "Automatic")
 * @param {object} options.additionalData - Additional context data (key-value pairs)
 * @returns {Promise<boolean>} - Whether the report was sent successfully
 */
export async function reportErrorToServer(options = {}) {
  const {
    message = "Unknown error",
    stack = "N/A",
    code = "N/A",
    errorType,
    reportSource,
    additionalData,
  } = options;

  const metadata = [
    { label: "Error Message", value: message },
    { label: "Error Stack", value: stack },
    { label: "Code", value: code },
    { label: "User Agent", value: navigator.userAgent },
    { label: "Language", value: navigator.language },
    { label: "Page URL", value: window.location.href },
  ];

  if (errorType) {
    metadata.push({ label: "Error Type", value: errorType });
  }

  if (reportSource) {
    metadata.push({ label: "Report Source", value: reportSource });
  }

  if (additionalData) {
    for (const [key, value] of Object.entries(additionalData)) {
      metadata.push({ label: key, value });
    }
  }

  try {
    const response = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Error", metadata }),
    });

    return response?.ok ?? false;
  } catch (err) {
    console.error("Failed to report error:", err);
    return false;
  }
}
