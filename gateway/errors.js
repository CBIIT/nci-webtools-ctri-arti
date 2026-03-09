/**
 * Structured error codes and helpers for the gateway API.
 *
 * Error ranges:
 *   1xxx — Validation
 *   2xxx — Auth / Authorization
 *   3xxx — Rate Limiting
 *   4xxx — Safety / Guardrail
 *   5xxx — Provider
 *   9xxx — Internal
 */

export const ErrorCode = {
  // 1xxx Validation
  MISSING_REQUIRED_FIELD: { code: 1001, httpStatus: 400 },
  INVALID_INPUT_FORMAT: { code: 1002, httpStatus: 400 },
  INVALID_MESSAGES_FORMAT: { code: 1003, httpStatus: 400 },
  INVALID_ACTION: { code: 1004, httpStatus: 400 },

  // 2xxx Auth
  INVALID_USER: { code: 2001, httpStatus: 400 },
  INVALID_AGENT: { code: 2002, httpStatus: 400 },
  INVALID_MODEL: { code: 2003, httpStatus: 400 },
  UNAUTHORIZED: { code: 2004, httpStatus: 401 },
  FORBIDDEN: { code: 2005, httpStatus: 403 },

  // 3xxx Rate Limiting
  RATE_LIMIT_EXCEEDED: { code: 3001, httpStatus: 429 },
  QUOTA_EXCEEDED: { code: 3002, httpStatus: 429 },

  // 4xxx Safety
  SAFETY_BLOCKED: { code: 4001, httpStatus: 400 },
  GUARDRAIL_BLOCKED: { code: 4002, httpStatus: 400 },
  CONTENT_FILTERED: { code: 4003, httpStatus: 400 },

  // 5xxx Provider
  PROVIDER_ERROR: { code: 5001, httpStatus: 502 },
  PROVIDER_TIMEOUT: { code: 5002, httpStatus: 504 },
  PROVIDER_UNAVAILABLE: { code: 5003, httpStatus: 503 },
  PROVIDER_RATE_LIMITED: { code: 5004, httpStatus: 429 },

  // 9xxx Internal
  INTERNAL_ERROR: { code: 9001, httpStatus: 500 },
  DATABASE_ERROR: { code: 9002, httpStatus: 500 },
  CONFIGURATION_ERROR: { code: 9003, httpStatus: 500 },
};

/**
 * Build a structured error response object.
 *
 * @param {string} errorType - Key from ErrorCode (e.g. "MISSING_REQUIRED_FIELD")
 * @param {string} message - Human-readable error message
 * @param {Object} [details] - Optional details object
 * @returns {{ error: Object }}
 */
export function gatewayError(errorType, message, details) {
  const def = ErrorCode[errorType];
  if (!def) {
    return {
      error: {
        code: 9001,
        errorType: "INTERNAL_ERROR",
        httpStatus: 500,
        message: message || "Unknown error",
      },
    };
  }
  const error = {
    code: def.code,
    errorType,
    httpStatus: def.httpStatus,
    message,
  };
  if (details) error.details = details;
  return { error };
}

/**
 * Send a structured error response.
 *
 * @param {Object} res - Express response object
 * @param {string} errorType - Key from ErrorCode
 * @param {string} message - Human-readable message
 * @param {Object} [details] - Optional details
 */
export function sendError(res, errorType, message, details) {
  const body = gatewayError(errorType, message, details);
  return res.status(body.error.httpStatus).json(body);
}

/**
 * Normalize a provider error into a gateway error type.
 * Maps HTTP status codes from upstream providers to gateway error codes.
 *
 * @param {Error} err - The caught error (may have a status/statusCode property)
 * @returns {{ errorType: string, message: string }}
 */
export function normalizeProviderError(err) {
  const status = err.status || err.statusCode || err.$metadata?.httpStatusCode || 500;
  const message = err.message || "Provider error";

  if (status === 504 || err.name === "TimeoutError") {
    return { errorType: "PROVIDER_TIMEOUT", message: `Provider timeout: ${message}` };
  }
  if (status === 503) {
    return { errorType: "PROVIDER_UNAVAILABLE", message: `Provider unavailable: ${message}` };
  }
  if (status === 429) {
    return { errorType: "PROVIDER_RATE_LIMITED", message: `Provider rate limited: ${message}` };
  }
  return { errorType: "PROVIDER_ERROR", message: `Provider error: ${message}` };
}
