import assert from "node:assert/strict";
import { describe, it } from "node:test";

import specs, { getToolSpecs } from "../tools/specs.js";

describe("tool-specs", () => {
  it("exports all tool specs by default", () => {
    const allSpecs = getToolSpecs();
    assert.ok(allSpecs.length >= 7, "should have at least 7 tools");
    const names = allSpecs.map((s) => s.toolSpec.name);
    assert.ok(names.includes("search"));
    assert.ok(names.includes("browse"));
    assert.ok(names.includes("data"));
    assert.ok(names.includes("editor"));
    assert.ok(names.includes("think"));
    assert.ok(names.includes("docxTemplate"));
    assert.ok(names.includes("recall"));
  });

  it("filters specs by tool names", () => {
    const filtered = getToolSpecs(["search", "browse"]);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].toolSpec.name, "search");
    assert.equal(filtered[1].toolSpec.name, "browse");
  });

  it("ignores unknown tool names", () => {
    const filtered = getToolSpecs(["search", "nonexistent"]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].toolSpec.name, "search");
  });

  it("each spec has required toolSpec structure", () => {
    for (const [name, spec] of Object.entries(specs)) {
      assert.ok(spec.toolSpec, `${name} should have toolSpec`);
      assert.equal(spec.toolSpec.name, name, `${name} toolSpec.name should match key`);
      assert.ok(spec.toolSpec.description, `${name} should have description`);
      assert.ok(spec.toolSpec.inputSchema, `${name} should have inputSchema`);
      assert.ok(spec.toolSpec.inputSchema.json, `${name} should have inputSchema.json`);
    }
  });
});


