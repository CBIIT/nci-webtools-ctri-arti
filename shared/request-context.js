import { randomUUID } from "node:crypto";

import { createAppError } from "./utils.js";

const VALID_ACTOR_TYPES = new Set(["user", "system", "anonymous"]);
const VALID_SOURCES = new Set(["server", "internal-http", "direct"]);
const LEGACY_ANONYMOUS_TOKENS = new Set(["", "anonymous", "null", "undefined"]);
const INVALID_REQUEST_ID_TOKENS = new Set(["", "unknown", "null", "undefined"]);

function normalizePositiveInteger(value, fieldName = "userId") {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  throw createAppError(400, `${fieldName} must be a positive integer`);
}

export function normalizeRequestId(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  const requestId = String(rawValue).trim();
  if (!requestId) {
    return null;
  }

  return INVALID_REQUEST_ID_TOKENS.has(requestId.toLowerCase()) ? null : requestId;
}

export function createRequestId() {
  return randomUUID();
}

export function resolveRequestId(...values) {
  for (const value of values) {
    const requestId = normalizeRequestId(value);
    if (requestId) {
      return requestId;
    }
  }

  return createRequestId();
}

function normalizeRequestMetadata(input = {}, defaults = {}) {
  const source = input.source ?? defaults.source ?? "direct";
  const requestId = resolveRequestId(input.requestId, defaults.requestId);

  if (!VALID_SOURCES.has(source)) {
    throw createAppError(400, `Invalid request context source: ${source}`);
  }

  return { source, requestId };
}

export function createAnonymousRequestContext(options = {}) {
  const { source, requestId } = normalizeRequestMetadata(options);
  return {
    actorType: "anonymous",
    userId: null,
    requestId,
    source,
  };
}

export function createUserRequestContext(userId, options = {}) {
  const { source, requestId } = normalizeRequestMetadata(options);
  return {
    actorType: "user",
    userId: normalizePositiveInteger(userId),
    requestId,
    source,
  };
}

export function createRequestContext(input, options = {}) {
  if (input && typeof input === "object") {
    const hasActorType = Object.hasOwn(input, "actorType");
    const hasUserId = Object.hasOwn(input, "userId");

    if (hasActorType || hasUserId) {
      const { source, requestId } = normalizeRequestMetadata(input, options);
      const actorType =
        input.actorType ??
        (input.userId === null || input.userId === undefined ? "anonymous" : "user");

      if (!VALID_ACTOR_TYPES.has(actorType)) {
        throw createAppError(400, `Invalid request actor type: ${actorType}`);
      }

      if (actorType === "anonymous") {
        if (input.userId !== null && input.userId !== undefined) {
          throw createAppError(400, "Anonymous request context cannot include a userId");
        }
        return createAnonymousRequestContext({ source, requestId });
      }

      return {
        actorType,
        userId: normalizePositiveInteger(input.userId),
        requestId,
        source,
      };
    }
  }

  if (input === null || input === undefined) {
    return createAnonymousRequestContext(options);
  }

  return createUserRequestContext(input, options);
}

export function parseInternalUserIdHeader(headerValue, options = {}) {
  if (headerValue === undefined) {
    return null;
  }

  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const normalized = String(value).trim().toLowerCase();

  if (LEGACY_ANONYMOUS_TOKENS.has(normalized)) {
    return createAnonymousRequestContext({
      source: "internal-http",
      requestId: options.requestId,
    });
  }

  return createUserRequestContext(value, {
    source: "internal-http",
    requestId: options.requestId,
  });
}

export function readInternalRequestContext(headers = {}, { required = true } = {}) {
  try {
    const context = parseInternalUserIdHeader(headers["x-user-id"], {
      requestId: headers["x-request-id"],
    });

    if (!context && required) {
      throw createAppError(400, "X-User-Id header required");
    }

    return context;
  } catch (error) {
    error.statusCode ||= 400;
    throw error;
  }
}

export function readHttpRequestContext(
  req,
  { allowAnonymous = false, allowInternalHeader = false, source = "server" } = {}
) {
  const headerContext = allowInternalHeader
    ? readInternalRequestContext(req.headers, { required: false })
    : null;
  const sessionContext =
    headerContext ||
    createRequestContext(req.session?.user?.id ?? null, {
      source,
      requestId: req.headers?.["x-request-id"],
    });

  return allowAnonymous ? sessionContext : requireUserRequestContext(sessionContext);
}

export function requireUserRequestContext(input, options = {}) {
  const context = createRequestContext(input, options);
  if (context.actorType !== "user") {
    throw createAppError(401, "Authentication required");
  }
  return context;
}

export function requestContextToInternalHeaders(input, options = {}) {
  const context = createRequestContext(input, options);
  return {
    "X-User-Id": context.actorType === "anonymous" ? "anonymous" : String(context.userId),
    "X-Request-Id": context.requestId,
  };
}
