import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createRequestId,
  createAnonymousRequestContext,
  createRequestContext,
  createUserRequestContext,
  normalizeRequestId,
  parseInternalUserIdHeader,
  readHttpRequestContext,
  readInternalRequestContext,
  resolveRequestId,
  requestContextToInternalHeaders,
  requireUserRequestContext,
} from "shared/request-context.js";

test("request context normalization", async (t) => {
  await t.test("creates a user context from a numeric id", () => {
    assert.deepStrictEqual(createUserRequestContext(42, { source: "server", requestId: "req-1" }), {
      actorType: "user",
      userId: 42,
      requestId: "req-1",
      source: "server",
    });
  });

  await t.test("creates an anonymous context from null input", () => {
    assert.deepStrictEqual(createRequestContext(null, { source: "direct", requestId: "req-2" }), {
      actorType: "anonymous",
      userId: null,
      requestId: "req-2",
      source: "direct",
    });
  });

  await t.test("parses the explicit anonymous transport token", () => {
    assert.deepStrictEqual(parseInternalUserIdHeader("anonymous", { requestId: "req-3" }), {
      actorType: "anonymous",
      userId: null,
      requestId: "req-3",
      source: "internal-http",
    });
  });

  await t.test("keeps legacy null transport compatibility", () => {
    assert.deepStrictEqual(parseInternalUserIdHeader("null", { requestId: "req-4" }), {
      actorType: "anonymous",
      userId: null,
      requestId: "req-4",
      source: "internal-http",
    });
  });

  await t.test("serializes anonymous context explicitly for internal HTTP", () => {
    const headers = requestContextToInternalHeaders(
      createAnonymousRequestContext({ source: "server" })
    );
    assert.strictEqual(headers["X-User-Id"], "anonymous");
    assert.match(headers["X-Request-Id"], /^[0-9a-f-]{36}$/i);
  });

  await t.test("rejects invalid internal user id headers", () => {
    assert.throws(() => parseInternalUserIdHeader("abc"), /positive integer/);
  });

  await t.test("reads request context from internal HTTP headers", () => {
    assert.deepStrictEqual(
      readInternalRequestContext({
        "x-user-id": "42",
        "x-request-id": "req-5",
      }),
      {
        actorType: "user",
        userId: 42,
        requestId: "req-5",
        source: "internal-http",
      }
    );
  });

  await t.test("prefers internal HTTP headers over session context when allowed", () => {
    assert.deepStrictEqual(
      readHttpRequestContext(
        {
          headers: {
            "x-user-id": "42",
            "x-request-id": "req-6",
          },
          session: {
            user: {
              id: 99,
            },
          },
        },
        { allowInternalHeader: true }
      ),
      {
        actorType: "user",
        userId: 42,
        requestId: "req-6",
        source: "internal-http",
      }
    );
  });

  await t.test("requires an authenticated user when asked", () => {
    assert.throws(
      () => requireUserRequestContext(createAnonymousRequestContext({ source: "server" })),
      /Authentication required/
    );
  });

  await t.test("treats placeholder request ids as missing", () => {
    assert.strictEqual(normalizeRequestId("unknown"), null);
    assert.strictEqual(normalizeRequestId(" undefined "), null);
    assert.strictEqual(normalizeRequestId("req-123"), "req-123");
  });

  await t.test("resolves the first valid request id or generates one", () => {
    assert.strictEqual(resolveRequestId("unknown", "req-7"), "req-7");
    assert.match(resolveRequestId("unknown", null), /^[0-9a-f-]{36}$/i);
  });

  await t.test("can generate standalone request ids", () => {
    assert.match(createRequestId(), /^[0-9a-f-]{36}$/i);
  });
});

