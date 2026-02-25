import assert from "node:assert";
import { test } from "node:test";

import { parseCsv } from "../services/csv-loader.js";

test("parseCsv", async (t) => {
  await t.test("parses basic CSV", () => {
    const result = parseCsv("name,age\nAlice,30\nBob,25\n");
    assert.deepStrictEqual(result, [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ]);
  });

  await t.test("handles quoted fields with commas", () => {
    const result = parseCsv('name,address\nAlice,"123 Main St, Apt 4"\n');
    assert.strictEqual(result[0].address, "123 Main St, Apt 4");
  });

  await t.test("handles quoted fields with newlines", () => {
    const result = parseCsv('name,bio\nAlice,"Line 1\nLine 2"\n');
    assert.strictEqual(result[0].bio, "Line 1\nLine 2");
  });

  await t.test("handles escaped quotes", () => {
    const result = parseCsv('name,quote\nAlice,"She said ""hello"""\n');
    assert.strictEqual(result[0].quote, 'She said "hello"');
  });

  await t.test("handles null literal", () => {
    const result = parseCsv("name,value\nAlice,null\n");
    assert.strictEqual(result[0].value, null);
  });

  await t.test("casts numeric values", () => {
    const result = parseCsv("name,count,rate\nAlice,42,3.14\n");
    assert.strictEqual(result[0].count, 42);
    assert.strictEqual(result[0].rate, 3.14);
  });

  await t.test("parses JSON values", () => {
    const result = parseCsv('name,data\nAlice,"[1,2,3]"\n');
    assert.deepStrictEqual(result[0].data, [1, 2, 3]);
  });

  await t.test("handles env: references", () => {
    process.env._CSV_TEST_VAR = "test-value";
    const result = parseCsv("name,val\nAlice,env:_CSV_TEST_VAR\n");
    assert.strictEqual(result[0].val, "test-value");
    delete process.env._CSV_TEST_VAR;
  });

  await t.test("returns null for missing env references", () => {
    const result = parseCsv("name,val\nAlice,env:NONEXISTENT_VAR_12345\n");
    assert.strictEqual(result[0].val, null);
  });

  await t.test("returns empty array for empty input", () => {
    assert.deepStrictEqual(parseCsv(""), []);
  });

  await t.test("returns empty array for header-only input", () => {
    assert.deepStrictEqual(parseCsv("name,age\n"), []);
  });

  await t.test("handles CRLF line endings", () => {
    const result = parseCsv("name,age\r\nAlice,30\r\n");
    assert.deepStrictEqual(result, [{ name: "Alice", age: 30 }]);
  });

  await t.test("parses JSON object values", () => {
    const result = parseCsv('name,config\nAlice,"{""key"":""value""}"\n');
    assert.deepStrictEqual(result[0].config, { key: "value" });
  });
});
