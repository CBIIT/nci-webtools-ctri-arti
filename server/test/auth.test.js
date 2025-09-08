import assert from "node:assert";
import { after, before, beforeEach, test } from "node:test";

import { requireRole } from "../services/middleware.js";

test("requireRole", async (t) => {
  before(async () => {});

  after(async () => {});

  beforeEach(async () => {});

  await t.test("should work correctly", async () => {
    const fn = requireRole("admin");
    assert.strictEqual(typeof fn, "function");
  });
});
