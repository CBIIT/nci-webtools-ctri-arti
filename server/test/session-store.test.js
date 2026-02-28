import db, { Session } from "database";
import assert from "node:assert";
import { test } from "node:test";

import session from "express-session";

import { createSessionStore } from "../services/session-store.js";

function promisify(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

test("session-store", async (t) => {
  const store = createSessionStore(session);

  await t.test("set: stores a session and get retrieves it", async () => {
    const sid = "test-sid-1";
    const sess = { cookie: { expires: new Date(Date.now() + 60000).toISOString() }, user: "alice" };
    await promisify(store, "set", sid, sess);

    const result = await promisify(store, "get", sid);
    assert.ok(result, "Session should be retrievable");
    assert.strictEqual(result.user, "alice");
  });

  await t.test("get: returns null for nonexistent session", async () => {
    const result = await promisify(store, "get", "nonexistent-sid");
    assert.strictEqual(result, null);
  });

  await t.test("set: upserts on conflict", async () => {
    const sid = "test-sid-upsert";
    const sess1 = { cookie: { expires: new Date(Date.now() + 60000).toISOString() }, val: "first" };
    await promisify(store, "set", sid, sess1);

    const sess2 = {
      cookie: { expires: new Date(Date.now() + 60000).toISOString() },
      val: "second",
    };
    await promisify(store, "set", sid, sess2);

    const result = await promisify(store, "get", sid);
    assert.strictEqual(result.val, "second");
  });

  await t.test("set: falls back to 24h TTL when cookie.expires is missing", async () => {
    const sid = "test-sid-no-expires";
    const sess = { cookie: {}, data: "ok" };
    await promisify(store, "set", sid, sess);

    const result = await promisify(store, "get", sid);
    assert.ok(result, "Session with default TTL should be retrievable");
    assert.strictEqual(result.data, "ok");
  });

  await t.test("set: falls back to 24h TTL when cookie.expires is invalid", async () => {
    const sid = "test-sid-bad-expires";
    const sess = { cookie: { expires: "not-a-date" }, data: "safe" };
    await promisify(store, "set", sid, sess);

    const result = await promisify(store, "get", sid);
    assert.ok(result, "Session with invalid expires should fall back to default TTL");
    assert.strictEqual(result.data, "safe");
  });

  await t.test("set: falls back to 24h TTL when sess is null-ish", async () => {
    const sid = "test-sid-null-sess";
    await promisify(store, "set", sid, {});

    const result = await promisify(store, "get", sid);
    assert.ok(result, "Session with empty object should use default TTL");
  });

  await t.test("get: returns null for expired session", async () => {
    const sid = "test-sid-expired";
    // Insert a session with an already-past expire directly
    const pastExpire = new Date(Date.now() - 60000);
    await db
      .insert(Session)
      .values({ sid, sess: { data: "old" }, expire: pastExpire })
      .onConflictDoUpdate({
        target: Session.sid,
        set: { sess: { data: "old" }, expire: pastExpire },
      });

    const result = await promisify(store, "get", sid);
    assert.strictEqual(result, null, "Expired session should not be returned");
  });

  await t.test("destroy: removes a session", async () => {
    const sid = "test-sid-destroy";
    const sess = { cookie: { expires: new Date(Date.now() + 60000).toISOString() }, data: "bye" };
    await promisify(store, "set", sid, sess);

    await promisify(store, "destroy", sid);

    const result = await promisify(store, "get", sid);
    assert.strictEqual(result, null, "Destroyed session should not be retrievable");
  });

  await t.test("touch: updates session expiry", async () => {
    const sid = "test-sid-touch";
    const sess = { cookie: { expires: new Date(Date.now() + 60000).toISOString() }, data: "touch" };
    await promisify(store, "set", sid, sess);

    // Touch with a new longer expire
    const newSess = { cookie: { expires: new Date(Date.now() + 120000).toISOString() } };
    await promisify(store, "touch", sid, newSess);

    // Session should still be retrievable
    const result = await promisify(store, "get", sid);
    assert.ok(result, "Touched session should still be retrievable");
  });

  await t.test("touch: handles invalid expires gracefully", async () => {
    const sid = "test-sid-touch-bad";
    const sess = { cookie: { expires: new Date(Date.now() + 60000).toISOString() }, data: "x" };
    await promisify(store, "set", sid, sess);

    // Touch with invalid expires — should not crash, falls back to 24h
    await promisify(store, "touch", sid, { cookie: { expires: "garbage" } });

    const result = await promisify(store, "get", sid);
    assert.ok(result, "Session should survive touch with invalid expires");
  });
});
