const VALID_ACTOR_TYPES = new Set(["user", "system", "anonymous"]);
const VALID_SOURCES = new Set(["server", "internal-http", "direct"]);
const LEGACY_ANONYMOUS_TOKENS = new Set(["", "anonymous", "null", "undefined"]);

function createContextError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizePositiveInteger(value, fieldName = "userId") {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  throw createContextError(`${fieldName} must be a positive integer`);
}

function normalizeRequestMetadata(input = {}, defaults = {}) {
  const source = input.source ?? defaults.source ?? "direct";
  const requestId = input.requestId ?? defaults.requestId ?? "unknown";

  if (!VALID_SOURCES.has(source)) {
    throw createContextError(`Invalid request context source: ${source}`);
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
        throw createContextError(`Invalid request actor type: ${actorType}`);
      }

      if (actorType === "anonymous") {
        if (input.userId !== null && input.userId !== undefined) {
          throw createContextError("Anonymous request context cannot include a userId");
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

export function requireUserRequestContext(input, options = {}) {
  const context = createRequestContext(input, options);
  if (context.actorType !== "user") {
    throw createContextError("Authentication required", 401);
  }
  return context;
}

export function requestContextToInternalHeaders(input, options = {}) {
  const context = createRequestContext(input, options);
  return {
    "X-User-Id": context.actorType === "anonymous" ? "anonymous" : String(context.userId),
  };
}
