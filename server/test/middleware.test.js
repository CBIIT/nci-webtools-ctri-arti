import { User, Role } from "database";
import assert from "node:assert";
import { after, test } from "node:test";

import { logRequests, nocache } from "shared/middleware.js";

import { requireRole, logErrors } from "../services/middleware.js";

function createMockReq(overrides = {}) {
  return {
    headers: {},
    session: {},
    path: "/test",
    ...overrides,
  };
}

function createMockRes() {
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
    set(headers) { Object.assign(res._headers, headers); return res; },
  };
  return res;
}

test("requireRole", async (t) => {
  await t.test("returns a function", () => {
    const middleware = requireRole("admin");
    assert.strictEqual(typeof middleware, "function");
  });

  await t.test("returns 401 with no session or apiKey", async () => {
    const middleware = requireRole("admin");
    const req = createMockReq();
    const res = createMockRes();
    await middleware(req, res, () => {});
    assert.strictEqual(res._status, 401);
    assert.deepStrictEqual(res._json, { error: "Authentication required" });
  });

  await t.test("returns 401 for unknown API key", async () => {
    const middleware = requireRole("admin");
    const req = createMockReq({ headers: { "x-api-key": "nonexistent-key" } });
    const res = createMockRes();
    await middleware(req, res, () => {});
    assert.strictEqual(res._status, 401);
  });

  await t.test("allows admin (roleID 1) through any role check", async () => {
    const middleware = requireRole("user");
    const req = createMockReq({ headers: { "x-api-key": process.env.TEST_API_KEY } });
    const res = createMockRes();
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    assert.ok(nextCalled, "next() should have been called for admin user");
  });

  await t.test("returns 403 for wrong role", async () => {
    // Create a non-admin user for this test
    const [testUser] = await User.findOrCreate({
      where: { email: "roletest@test.com" },
      defaults: {
        firstName: "Role",
        lastName: "Test",
        status: "active",
        roleID: 3, // "user" role
        apiKey: "role-test-api-key",
        budget: 100,
        remaining: 100,
      },
    });

    const middleware = requireRole("super user");
    const req = createMockReq({ headers: { "x-api-key": "role-test-api-key" } });
    const res = createMockRes();
    await middleware(req, res, () => {});
    assert.strictEqual(res._status, 403);
    assert.deepStrictEqual(res._json, { error: "Authorization required" });

    await testUser.destroy();
  });

  await t.test("passes with correct role", async () => {
    const [testUser] = await User.findOrCreate({
      where: { email: "roletest2@test.com" },
      defaults: {
        firstName: "Role",
        lastName: "Test2",
        status: "active",
        roleID: 3,
        apiKey: "role-test-api-key-2",
        budget: 100,
        remaining: 100,
      },
    });

    const middleware = requireRole("user");
    const req = createMockReq({ headers: { "x-api-key": "role-test-api-key-2" } });
    const res = createMockRes();
    let nextCalled = false;
    await middleware(req, res, () => { nextCalled = true; });
    assert.ok(nextCalled, "next() should have been called for matching role");

    await testUser.destroy();
  });

  await t.test("sets user in session for downstream handlers", async () => {
    const middleware = requireRole();
    const req = createMockReq({ headers: { "x-api-key": process.env.TEST_API_KEY } });
    const res = createMockRes();
    await middleware(req, res, () => {});
    assert.ok(req.session.user, "User should be set in session");
    assert.strictEqual(req.session.user.email, "test@test.com");
  });
});

test("logRequests", async (t) => {
  await t.test("calls next", () => {
    const middleware = logRequests();
    const req = createMockReq();
    let nextCalled = false;
    middleware(req, {}, () => { nextCalled = true; });
    assert.ok(nextCalled);
  });

  await t.test("sets startTime on request", () => {
    const middleware = logRequests();
    const req = createMockReq();
    middleware(req, {}, () => {});
    assert.ok(typeof req.startTime === "number");
    assert.ok(req.startTime > 0);
  });
});

test("logErrors", async (t) => {
  await t.test("sets status code from error", () => {
    const middleware = logErrors();
    const error = new Error("test error");
    error.statusCode = 500;
    const res = createMockRes();
    middleware(error, createMockReq(), res, () => {});
    assert.strictEqual(res._status, 500);
  });

  await t.test("defaults to 400 when no statusCode", () => {
    const middleware = logErrors();
    const error = new Error("bad request");
    const res = createMockRes();
    middleware(error, createMockReq(), res, () => {});
    assert.strictEqual(res._status, 400);
  });

  await t.test("returns JSON error response", () => {
    const middleware = logErrors();
    const error = new Error("test error");
    error.statusCode = 422;
    const res = createMockRes();
    middleware(error, createMockReq(), res, () => {});
    assert.ok(res._json);
    assert.ok(res._json.error, "test error");
  });
});

test("nocache", async (t) => {
  await t.test("sets correct cache headers", () => {
    const res = createMockRes();
    let nextCalled = false;
    nocache({}, res, () => { nextCalled = true; });
    assert.ok(res._headers["Cache-Control"].includes("no-store"));
    assert.strictEqual(res._headers["Expires"], "0");
    assert.strictEqual(res._headers["Pragma"], "no-cache");
    assert.strictEqual(res._headers["Surrogate-Control"], "no-store");
    assert.strictEqual(res._headers["Vary"], "*");
  });

  await t.test("calls next", () => {
    const res = createMockRes();
    let nextCalled = false;
    nocache({}, res, () => { nextCalled = true; });
    assert.ok(nextCalled);
  });
});
