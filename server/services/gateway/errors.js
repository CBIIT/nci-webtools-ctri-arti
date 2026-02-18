/**
 * Standardized Error Codes for LLM Gateway
 * Each error type has a unique numeric code for programmatic handling
 *
 * Code ranges:
 * - 1xxx: Validation errors
 * - 2xxx: Authentication/Authorization errors
 * - 3xxx: Rate limiting errors
 * - 4xxx: Safety/Guardrail errors
 * - 5xxx: Provider errors
 * - 9xxx: Internal errors
 */

export const ErrorType = {
  // Validation Errors (1xxx)
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  INVALID_INPUT_FORMAT: "INVALID_INPUT_FORMAT",
  INVALID_MESSAGES_FORMAT: "INVALID_MESSAGES_FORMAT",

  // Authentication/Authorization Errors (2xxx)
  INVALID_USER: "INVALID_USER",
  INVALID_AGENT: "INVALID_AGENT",
  INVALID_MODEL: "INVALID_MODEL",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Rate Limiting (3xxx)
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",

  // Safety/Guardrail Errors (4xxx)
  SAFETY_BLOCKED: "SAFETY_BLOCKED",
  GUARDRAIL_BLOCKED: "GUARDRAIL_BLOCKED",
  CONTENT_FILTERED: "CONTENT_FILTERED",

  // Provider Errors (5xxx)
  PROVIDER_ERROR: "PROVIDER_ERROR",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_RATE_LIMITED: "PROVIDER_RATE_LIMITED",

  // Internal Errors (9xxx)
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
};

// Unique numeric error codes for each error type
export const ErrorCode = {
  // Validation Errors (1xxx)
  [ErrorType.MISSING_REQUIRED_FIELD]: 1001,
  [ErrorType.INVALID_INPUT_FORMAT]: 1002,
  [ErrorType.INVALID_MESSAGES_FORMAT]: 1003,

  // Authentication/Authorization Errors (2xxx)
  [ErrorType.INVALID_USER]: 2001,
  [ErrorType.INVALID_AGENT]: 2002,
  [ErrorType.INVALID_MODEL]: 2003,
  [ErrorType.UNAUTHORIZED]: 2004,
  [ErrorType.FORBIDDEN]: 2005,

  // Rate Limiting (3xxx)
  [ErrorType.RATE_LIMIT_EXCEEDED]: 3001,
  [ErrorType.QUOTA_EXCEEDED]: 3002,

  // Safety/Guardrail Errors (4xxx)
  [ErrorType.SAFETY_BLOCKED]: 4001,
  [ErrorType.GUARDRAIL_BLOCKED]: 4002,
  [ErrorType.CONTENT_FILTERED]: 4003,

  // Provider Errors (5xxx)
  [ErrorType.PROVIDER_ERROR]: 5001,
  [ErrorType.PROVIDER_TIMEOUT]: 5002,
  [ErrorType.PROVIDER_UNAVAILABLE]: 5003,
  [ErrorType.PROVIDER_RATE_LIMITED]: 5004,

  // Internal Errors (9xxx)
  [ErrorType.INTERNAL_ERROR]: 9001,
  [ErrorType.DATABASE_ERROR]: 9002,
  [ErrorType.CONFIGURATION_ERROR]: 9003,
};

// Map error types to default HTTP status codes
export const ErrorHttpStatus = {
  [ErrorType.MISSING_REQUIRED_FIELD]: 400,
  [ErrorType.INVALID_INPUT_FORMAT]: 400,
  [ErrorType.INVALID_MESSAGES_FORMAT]: 400,
  [ErrorType.INVALID_USER]: 400,
  [ErrorType.INVALID_AGENT]: 403,
  [ErrorType.INVALID_MODEL]: 400,
  [ErrorType.UNAUTHORIZED]: 401,
  [ErrorType.FORBIDDEN]: 403,
  [ErrorType.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorType.QUOTA_EXCEEDED]: 429,
  [ErrorType.SAFETY_BLOCKED]: 400,
  [ErrorType.GUARDRAIL_BLOCKED]: 400,
  [ErrorType.CONTENT_FILTERED]: 400,
  [ErrorType.PROVIDER_ERROR]: 502,
  [ErrorType.PROVIDER_TIMEOUT]: 504,
  [ErrorType.PROVIDER_UNAVAILABLE]: 503,
  [ErrorType.PROVIDER_RATE_LIMITED]: 429,
  [ErrorType.INTERNAL_ERROR]: 500,
  [ErrorType.DATABASE_ERROR]: 500,
  [ErrorType.CONFIGURATION_ERROR]: 500,
};

/**
 * Create a standardized error response object
 * @param {Object} options
 * @param {string} options.errorType - Error type from ErrorType enum
 * @param {string} options.message - Human-readable error message
 * @param {Object} [options.details] - Optional structured metadata
 * @param {number} [options.httpStatus] - Override default HTTP status
 * @returns {Object} Standardized error response
 */
export function createErrorResponse({ errorType, message, details, httpStatus }) {
  const status = httpStatus || ErrorHttpStatus[errorType] || 500;
  const code = ErrorCode[errorType] || 9001;

  return {
    error: {
      code,
      error_type: errorType,
      http_status: status,
      message,
      ...(details && Object.keys(details).length > 0 && { details }),
    },
  };
}

/**
 * Send a standardized error response
 * @param {Object} res - Express response object
 * @param {Object} options - Same as createErrorResponse options
 */
export function sendError(res, options) {
  const status = options.httpStatus || ErrorHttpStatus[options.errorType] || 500;
  const errorResponse = createErrorResponse(options);
  res.status(status).json(errorResponse);
}

/**
 * Map provider HTTP status to appropriate error type
 * @param {number} statusCode - HTTP status code from provider
 * @returns {string} Error type
 */
export function getProviderErrorType(statusCode) {
  if (statusCode === 504) return ErrorType.PROVIDER_TIMEOUT;
  if (statusCode === 503) return ErrorType.PROVIDER_UNAVAILABLE;
  if (statusCode === 429) return ErrorType.PROVIDER_RATE_LIMITED;
  if (statusCode >= 500) return ErrorType.PROVIDER_ERROR;
  return ErrorType.INTERNAL_ERROR;
}

