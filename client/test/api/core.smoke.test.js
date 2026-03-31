/**
 * Core API smoke tests — real server route contracts that should stay fast.
 */
import assert from "/test/assert.js";
import { apiJson as api } from "/test/helpers.js";
import test from "/test/test.js";

import { assertISODate, getSmokeTestUser } from "./smoke-helpers.js";

test("Core API Smoke Tests", async (t) => {
  const testUser = await getSmokeTestUser();

  await t.test("POST /session refreshes session", async () => {
    const { status, json } = await api("POST", "/session");
    assert.strictEqual(status, 200);
    assert.ok(json.user, "should return user");
    assert.ok(json.expires, "should return expires");
    assertISODate(json.expires, "expires");
  });

  await t.test("POST /admin/users survives timestamps + nested Role", async () => {
    const payload = { ...testUser };
    const { status, json } = await api("POST", "/admin/users", payload);
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
    assert.ok(json.id, "response should have id");
    if (json.createdAt) assertISODate(json.createdAt, "createdAt");
    if (json.updatedAt) assertISODate(json.updatedAt, "updatedAt");
  });

  await t.test("GET /admin/roles returns array", async () => {
    const { status, json } = await api("GET", "/admin/roles");
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(json), "roles should be an array");
    assert.ok(json.length > 0, "should have at least one role");
    assert.ok(json[0].name, "role should have a name");
  });

  await t.test("POST + GET + DELETE /conversations round-trip", async () => {
    const createRes = await api("POST", "/conversations", { title: "__smoke_test__" });
    assert.strictEqual(createRes.status, 201, `create: expected 201, got ${createRes.status}`);
    const convo = createRes.json;
    assert.ok(convo.id, "created conversation should have id");
    assert.strictEqual(convo.title, "__smoke_test__");
    if (convo.createdAt) assertISODate(convo.createdAt, "conversation createdAt");

    const getRes = await api("GET", `/conversations/${convo.id}`);
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.json.id, convo.id);

    const delRes = await api("DELETE", `/conversations/${convo.id}`);
    assert.strictEqual(delRes.status, 200);
  });

  await t.test("GET /admin/users with search filter", async () => {
    const { status, json } = await api(
      "GET",
      `/admin/users?search=${encodeURIComponent(testUser.email.substring(0, 5))}&limit=10&offset=0`
    );
    assert.strictEqual(status, 200);
    assert.ok(json.data, "response should have data");
    assert.ok(Array.isArray(json.data), "data should be an array");
    assert.ok(json.meta, "response should have meta");
    assert.ok(json.meta.total !== undefined, "meta should have total");
  });

  await t.test("GET /admin/users with status filter", async () => {
    const { status, json } = await api("GET", "/admin/users?status=active&limit=10&offset=0");
    assert.strictEqual(status, 200);
    assert.ok(json.data, "response should have data");
    assert.ok(json.data.length > 0, "should have at least one active user");
  });

  await t.test("GET /admin/users with pagination", async () => {
    const { status, json } = await api("GET", "/admin/users?limit=1&offset=0");
    assert.strictEqual(status, 200);
    assert.ok(json.data, "response should have data");
    assert.ok(json.data.length <= 1, "should respect limit=1");
    assert.ok(json.meta.total >= 1, "total count should be at least 1");
  });

  await t.test("GET /admin/analytics groupBy=user", async () => {
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { status, json } = await api(
      "GET",
      `/admin/analytics?groupBy=user&startDate=${weekAgo}&endDate=${today}`
    );
    assert.strictEqual(status, 200);
    assert.ok(json.data, "analytics should have data");
    assert.ok(Array.isArray(json.data), "analytics data should be an array");
  });

  await t.test("GET /admin/analytics groupBy=model", async () => {
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { status, json } = await api(
      "GET",
      `/admin/analytics?groupBy=model&startDate=${weekAgo}&endDate=${today}`
    );
    assert.strictEqual(status, 200);
    assert.ok(json.data, "analytics should have data");
    assert.ok(Array.isArray(json.data), "analytics data should be an array");
  });

  await t.test("GET /admin/analytics groupBy=day", async () => {
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const { status, json } = await api(
      "GET",
      `/admin/analytics?groupBy=day&startDate=${weekAgo}&endDate=${today}`
    );
    assert.strictEqual(status, 200);
    assert.ok(json.data, "analytics should have data");
    assert.ok(Array.isArray(json.data), "analytics data should be an array");
  });

  await t.test("POST /admin/profile updates user profile", async () => {
    const { status, json } = await api("POST", "/admin/profile", {
      firstName: "SmokeAPI",
      lastName: "TestAPI",
    });
    assert.strictEqual(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
    assert.ok(json.id || json.email, "response should contain user data");
  });

  await t.test("GET /model/list returns models array", async () => {
    const { status, json } = await api("GET", "/model/list");
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(json), "model list should be an array");
    assert.ok(json.length > 0, "should have at least one model");
  });

  await t.test("GET /admin/users/99999 returns 404 for non-existent user", async () => {
    const { status } = await api("GET", "/admin/users/99999");
    assert.ok(status === 404 || status === 400, `expected 404 or 400, got ${status}`);
  });
});
