/**
 * Model and usage smoke tests — prove scripted-model and usage recording wiring.
 */
import assert from "/test/assert.js";
import { apiJson as api } from "/test/helpers.js";
import test from "/test/test.js";

import {
  assertISODate,
  formatLocalDate,
  getSmokeTestUser,
  invokeScriptedModel,
  SCRIPTED_MODEL,
} from "./smoke-helpers.js";

test("Model And Usage Smoke Tests", async (t) => {
  const testUser = await getSmokeTestUser();

  await t.test(
    "POST /model/invoke with scripted-model echoes text and generates usage",
    async () => {
      const res = await invokeScriptedModel({ text: "smoke test" });
      assert.ok(res.ok, `scripted model request failed: ${res.status}`);
      const json = await res.json();
      assert.ok(json.output, "response should have output");
      assert.ok(json.usage, "response should have usage");
      assert.strictEqual(
        json.output?.message?.content?.[0]?.text,
        "smoke test",
        "scripted model should echo plain text input"
      );
    }
  );

  await t.test(
    `POST /model/invoke with ${SCRIPTED_MODEL} stream=true returns streaming response`,
    async () => {
      const res = await invokeScriptedModel({ text: "stream test", stream: true });
      assert.ok(res.ok, `streaming request failed: ${res.status}`);
      const text = await res.text();
      assert.ok(text.length > 0, "streaming response should have content");
      assert.ok(text.includes("stream test"), "streamed response should include echoed text");
    }
  );

  await t.test("POST /model/invoke stream=true is recorded in GET /admin/usage", async () => {
    const today = formatLocalDate(new Date());
    const monthAgo = formatLocalDate(new Date(Date.now() - 30 * 86400000));
    const usageType = `e2e-usage-repro-${Date.now()}`;

    const before = await api(
      "GET",
      `/admin/usage?userId=${testUser.id}&type=${encodeURIComponent(usageType)}&startDate=${monthAgo}&endDate=${today}&limit=20`
    );
    assert.strictEqual(before.status, 200);
    const beforeCount = before.json?.meta?.total ?? before.json?.data?.length ?? 0;

    const res = await invokeScriptedModel({
      text: "usage repro stream test",
      stream: true,
      type: usageType,
    });
    assert.ok(res.ok, `streaming request failed: ${res.status}`);
    const streamText = await res.text();
    assert.ok(streamText.length > 0, "streaming response should have content");

    let after;
    for (let attempt = 0; attempt < 5; attempt++) {
      after = await api(
        "GET",
        `/admin/usage?userId=${testUser.id}&type=${encodeURIComponent(usageType)}&startDate=${monthAgo}&endDate=${today}&limit=20`
      );
      assert.strictEqual(after.status, 200);
      const afterCount = after.json?.meta?.total ?? after.json?.data?.length ?? 0;
      if (afterCount > beforeCount) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const afterCount = after.json?.meta?.total ?? after.json?.data?.length ?? 0;
    assert.ok(
      afterCount > beforeCount,
      `expected usage count to increase for type ${usageType}; before=${beforeCount}, after=${afterCount}`
    );

    const entry = (after.json?.data || []).find((row) => row.type === usageType);
    assert.ok(entry, "expected recorded usage entry");
    assert.strictEqual(entry.userID, testUser.id, "usage entry should belong to the test user");
    assert.strictEqual(entry.modelName, "Scripted Model", "usage entry should resolve model name");
    assert.ok(entry.requestId, "usage entry should include a request id");
    assert.ok(entry.quantity > 0, "usage entry should include usage quantity");
    assert.strictEqual(typeof entry.unit, "string", "usage entry should include a usage unit");
    assert.strictEqual(typeof entry.cost, "number", "usage entry should include a numeric cost");
    assertISODate(entry.createdAt, "usage createdAt");
  });
});
