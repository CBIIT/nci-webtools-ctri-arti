import { parseNdjsonStream } from "./ndjson.js";

export function buildQueryString(params, { serializeValue } = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;

    const serializedValue = serializeValue ? serializeValue(key, value) : value;
    if (serializedValue === undefined || serializedValue === null) continue;

    query.set(key, String(serializedValue));
  }

  const text = query.toString();
  return text ? `?${text}` : "";
}

export async function readJsonErrorPayload(response) {
  return response.json().catch(() => ({ error: response.statusText }));
}

export function createStatusError(response, fallbackMessage, payload = {}) {
  const error = new Error(payload.error || fallbackMessage);
  error.status = response.status;
  return error;
}

export function createStatusCodeError(response, fallbackMessage, payload = {}) {
  const error = createStatusError(response, fallbackMessage, payload);
  if (payload.code) {
    error.code = payload.code;
  }
  return error;
}

export function createPlainError(_response, fallbackMessage, payload = {}) {
  return new Error(payload.error || fallbackMessage);
}

export function sendJsonRequest(fetchImpl, { url, method = "GET", headers = {}, body } = {}) {
  return fetchImpl(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function requestJson(
  fetchImpl,
  { url, method = "GET", headers = {}, body, errorMessage, createError = createStatusError } = {}
) {
  const response = await sendJsonRequest(fetchImpl, {
    url,
    method,
    headers,
    body,
  });

  if (!response.ok) {
    const payload = await readJsonErrorPayload(response);
    throw createError(response, errorMessage, payload);
  }

  return response.json();
}

export async function* streamNdjsonRequest(
  fetchImpl,
  {
    url,
    method = "GET",
    headers = {},
    body,
    errorMessage,
    createError = createPlainError,
    onParseError,
  } = {}
) {
  const response = await sendJsonRequest(fetchImpl, {
    url,
    method,
    headers,
    body,
  });

  if (!response.ok) {
    const payload = await readJsonErrorPayload(response);
    throw createError(response, errorMessage, payload);
  }

  yield* parseNdjsonStream(response.body, { onParseError });
}
