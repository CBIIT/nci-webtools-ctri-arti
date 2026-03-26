import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateUserMessageContent } from "../validation.js";

describe("validateUserMessageContent", () => {
  it("accepts normal user text and tool-result messages", () => {
    assert.doesNotThrow(() => validateUserMessageContent([{ text: "hello" }]));
    assert.doesNotThrow(() =>
      validateUserMessageContent([
        { toolResult: { toolUseId: "tu_1", content: [{ json: { results: { ok: true } } }] } },
      ])
    );
  });

  it("rejects tool uses in user messages", () => {
    assert.throws(
      () =>
        validateUserMessageContent([
          { toolUse: { toolUseId: "tu_1", name: "search", input: { query: "nci" } } },
        ]),
      /User messages cannot contain tool uses/
    );
  });
});
