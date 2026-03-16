import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAnonymousRequestContext,
  createRequestContext,
  createUserRequestContext,
  parseInternalUserIdHeader,
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
    assert.deepStrictEqual(
      requestContextToInternalHeaders(createAnonymousRequestContext({ source: "server" })),
      {
        "X-User-Id": "anonymous",
      }
    );
  });

  await t.test("rejects invalid internal user id headers", () => {
    assert.throws(() => parseInternalUserIdHeader("abc"), /positive integer/);
  });

  await t.test("requires an authenticated user when asked", () => {
    assert.throws(
      () => requireUserRequestContext(createAnonymousRequestContext({ source: "server" })),
      /Authentication required/
    );
  });
});
