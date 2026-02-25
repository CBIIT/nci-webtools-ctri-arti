import assert from "node:assert";
import { test } from "node:test";

import { getAuthorizedUrl, getAuthorizedHeaders, WHITELIST } from "../services/proxy.js";

test("getAuthorizedUrl", async (t) => {
  await t.test("adds api_key for govinfo.gov", () => {
    const url = new URL("https://api.govinfo.gov/search");
    const result = getAuthorizedUrl(url, { DATA_GOV_API_KEY: "test-gov-key" });
    assert.ok(result.includes("api_key=test-gov-key"));
  });

  await t.test("adds api_key for congress.gov", () => {
    const url = new URL("https://api.congress.gov/v3/bill");
    const result = getAuthorizedUrl(url, { CONGRESS_GOV_API_KEY: "test-congress-key" });
    assert.ok(result.includes("api_key=test-congress-key"));
  });

  await t.test("does not add params for unknown host", () => {
    const url = new URL("https://example.com/api");
    const result = getAuthorizedUrl(url, {});
    assert.strictEqual(result, "https://example.com/api");
  });
});

test("getAuthorizedHeaders", async (t) => {
  await t.test("adds subscription token for brave.com", () => {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    const headers = getAuthorizedHeaders(url, { BRAVE_SEARCH_API_KEY: "brave-key" });
    assert.strictEqual(headers["x-subscription-token"], "brave-key");
  });

  await t.test("returns empty object for unknown host", () => {
    const url = new URL("https://example.com/api");
    const headers = getAuthorizedHeaders(url, {});
    assert.deepStrictEqual(headers, {});
  });
});

test("WHITELIST", async (t) => {
  await t.test("exists and is an array", () => {
    assert.ok(Array.isArray(WHITELIST));
    assert.ok(WHITELIST.length > 0);
  });

  await t.test("contains RegExp entries", () => {
    for (const entry of WHITELIST) {
      assert.ok(entry instanceof RegExp);
    }
  });
});
