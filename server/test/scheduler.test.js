import "../test-support/db.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { resetUsageLimits } from "../runtime/scheduler.js";

test("resetUsageLimits returns the users reset result", async () => {
  const result = await resetUsageLimits();

  assert.equal(result.success, true);
  assert.equal(typeof result.updatedUsers, "number");
});





