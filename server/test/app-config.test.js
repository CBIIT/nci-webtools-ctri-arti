import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isToolEnabledFromDisabledValue } from "shared/app-config.js";

describe("isToolEnabledFromDisabledValue", () => {
  it("treats tools outside the gated list as enabled", () => {
    assert.equal(isToolEnabledFromDisabledValue("ReportBuilder", "Chat"), true);
    assert.equal(isToolEnabledFromDisabledValue("ReportBuilder", ""), true);
  });

  it("returns true when toolName is empty or not a string", () => {
    assert.equal(isToolEnabledFromDisabledValue("", "Chat"), true);
    assert.equal(isToolEnabledFromDisabledValue("   ", "Chat"), true);
    assert.equal(isToolEnabledFromDisabledValue(null, "Chat"), true);
    assert.equal(isToolEnabledFromDisabledValue(undefined, "Chat"), true);
  });

  it("returns true for a gated tool when the disabled list is empty", () => {
    assert.equal(isToolEnabledFromDisabledValue("Chat", ""), true);
    assert.equal(isToolEnabledFromDisabledValue("Chat", null), true);
    assert.equal(isToolEnabledFromDisabledValue("Chat", undefined), true);
    assert.equal(isToolEnabledFromDisabledValue("Chat", "  "), true);
  });

  it("returns false when the gated tool appears in the disabled value", () => {
    assert.equal(isToolEnabledFromDisabledValue("Chat", "Chat"), false);
    assert.equal(isToolEnabledFromDisabledValue("Translator", "Chat,Translator"), false);
  });

  it("matches case-insensitively for tool name and configuration db entries", () => {
    assert.equal(isToolEnabledFromDisabledValue("CHAT", "chat"), false);
    assert.equal(isToolEnabledFromDisabledValue("Chat", "CHAT, Translator"), false);
    assert.equal(isToolEnabledFromDisabledValue("consentcrafter", "ConsentCrafter"), false);
  });

  it("trims configuration db entry and ignores empty segments", () => {
    assert.equal(isToolEnabledFromDisabledValue("Chat", " Chat , , "), false);
    assert.equal(isToolEnabledFromDisabledValue("Translator", "Chat"), true);
  });
});
