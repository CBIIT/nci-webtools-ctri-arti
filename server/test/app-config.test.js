import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDisabledToolNamesFromConfig } from "shared/app-config.js";

describe("getDisabledToolNamesFromConfig", () => {
  it("returns a sorted deduped array of lowercase names", () => {
    assert.deepEqual(getDisabledToolNamesFromConfig(""), []);
    assert.deepEqual(getDisabledToolNamesFromConfig("Chat,Translator"), ["chat", "translator"]);
    assert.deepEqual(getDisabledToolNamesFromConfig("translator, chat"), ["chat", "translator"]);
    assert.deepEqual(getDisabledToolNamesFromConfig(" Chat , , "), ["chat"]);
  });
});
