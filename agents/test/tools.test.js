import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { getToolFn, toolImplementations } from "../tools.js";

describe("tools", () => {
  describe("getToolFn", () => {
    it("returns function for known tools", () => {
      assert.equal(typeof getToolFn("search"), "function");
      assert.equal(typeof getToolFn("browse"), "function");
      assert.equal(typeof getToolFn("data"), "function");
      assert.equal(typeof getToolFn("editor"), "function");
      assert.equal(typeof getToolFn("think"), "function");
      assert.equal(typeof getToolFn("docxTemplate"), "function");
    });

    it("returns undefined for unknown tools", () => {
      assert.equal(getToolFn("code"), undefined);
      assert.equal(getToolFn("nonexistent"), undefined);
    });
  });

  describe("toolImplementations", () => {
    it("has all expected tools", () => {
      const expected = ["search", "browse", "data", "editor", "think", "docxTemplate"];
      for (const name of expected) {
        assert.ok(toolImplementations[name], `should have ${name}`);
        assert.equal(typeof toolImplementations[name], "function");
      }
    });

    it("does not include code tool", () => {
      assert.equal(toolImplementations.code, undefined);
    });
  });

  describe("editor tool", () => {
    function createMockCms() {
      const resources = [];
      return {
        getResourcesByAgent: async () => [...resources],
        addResource: async (userId, data) => {
          const resource = { id: resources.length + 1, ...data };
          resources.push(resource);
          return resource;
        },
        deleteResource: async (userId, resourceId) => {
          const idx = resources.findIndex((r) => r.id === resourceId);
          if (idx >= 0) resources.splice(idx, 1);
        },
        _resources: resources,
      };
    }

    it("creates a new file", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, cms };
      const result = await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "hello world" },
        context
      );
      assert.equal(result, "Successfully created file: test.txt");
      assert.equal(cms._resources.length, 1);
      assert.equal(cms._resources[0].content, "hello world");
    });

    it("views a file", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, cms };
      await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "line1\nline2\nline3" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "view", path: "test.txt" },
        context
      );
      assert.ok(result.includes("1: line1"));
      assert.ok(result.includes("2: line2"));
      assert.ok(result.includes("3: line3"));
    });

    it("returns error for missing file on view", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, cms };
      const result = await toolImplementations.editor(
        { command: "view", path: "missing.txt" },
        context
      );
      assert.equal(result, "File not found: missing.txt");
    });

    it("replaces text in file", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, cms };
      await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "hello world" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "str_replace", path: "test.txt", old_str: "world", new_str: "earth" },
        context
      );
      assert.equal(result, "Successfully replaced text at exactly one location.");
      // Verify content changed
      const viewResult = await toolImplementations.editor(
        { command: "view", path: "test.txt" },
        context
      );
      assert.ok(viewResult.includes("hello earth"));
    });

    it("inserts text at line", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, cms };
      await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "line1\nline2" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "insert", path: "test.txt", insert_line: 1, new_str: "inserted" },
        context
      );
      assert.ok(result.includes("Successfully inserted"));
      const viewResult = await toolImplementations.editor(
        { command: "view", path: "test.txt" },
        context
      );
      assert.ok(viewResult.includes("inserted"));
    });

    it("requires path parameter", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, cms };
      const result = await toolImplementations.editor({ command: "view" }, context);
      assert.equal(result, "Error: File path is required");
    });

    it("requires command parameter", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, cms };
      const result = await toolImplementations.editor({ path: "test.txt" }, context);
      assert.equal(result, "Error: Command is required");
    });
  });

  describe("think tool", () => {
    it("creates a thoughts file", async () => {
      const resources = [];
      const cms = {
        getResourcesByAgent: async () => [...resources],
        addResource: async (userId, data) => {
          const resource = { id: resources.length + 1, ...data };
          resources.push(resource);
          return resource;
        },
        deleteResource: async (userId, resourceId) => {
          const idx = resources.findIndex((r) => r.id === resourceId);
          if (idx >= 0) resources.splice(idx, 1);
        },
      };
      const context = { userId: 1, agentId: 1, cms };
      const result = await toolImplementations.think(
        { thought: "This is a test thought" },
        context
      );
      assert.equal(result, "Thinking complete.");
      assert.ok(resources.some((r) => r.name === "_thoughts.txt"));
    });
  });
});
