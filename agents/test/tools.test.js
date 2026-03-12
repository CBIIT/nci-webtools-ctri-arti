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
        getResourcesByConversation: async () => resources.filter((r) => r.conversationID),
        addResource: async (userId, data) => {
          const resource = { id: resources.length + 1, userID: userId, ...data };
          resources.push(resource);
          return resource;
        },
        updateResource: async (userId, resourceId, updates) => {
          const r = resources.find((r) => r.id === resourceId);
          if (r) Object.assign(r, updates);
          return r;
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
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      const result = await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "hello world" },
        context
      );
      assert.equal(result.status, "created");
      assert.equal(result.content, "hello world");
      assert.equal(cms._resources.length, 1);
      assert.equal(cms._resources[0].conversationID, 10);
    });

    it("creates agent-scoped file for memories/ path", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      const result = await toolImplementations.editor(
        { command: "create", path: "memories/profile.txt", file_text: "user likes cats" },
        context
      );
      assert.equal(result.status, "created");
      assert.equal(cms._resources[0].conversationID, undefined);
    });

    it("errors on create if file exists", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "first" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "second" },
        context
      );
      assert.equal(result.status, "error");
      assert.ok(result.error.includes("already exists"));
    });

    it("views a file", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "line1\nline2\nline3" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "view", path: "test.txt" },
        context
      );
      assert.equal(result.status, "viewed");
      assert.equal(result.content, "line1\nline2\nline3");
    });

    it("lists directory contents", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      await toolImplementations.editor(
        { command: "create", path: "dir/a.txt", file_text: "a" },
        context
      );
      await toolImplementations.editor(
        { command: "create", path: "dir/b.txt", file_text: "b" },
        context
      );
      await toolImplementations.editor(
        { command: "create", path: "dir/sub/c.txt", file_text: "c" },
        context
      );
      const result = await toolImplementations.editor({ command: "view", path: "dir/" }, context);
      assert.equal(result.status, "directory");
      assert.ok(result.entries.includes("a.txt"));
      assert.ok(result.entries.includes("b.txt"));
      assert.ok(result.entries.includes("sub/"));
    });

    it("returns error for missing file on view", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      const result = await toolImplementations.editor(
        { command: "view", path: "missing.txt" },
        context
      );
      assert.equal(result.status, "error");
      assert.ok(result.error.includes("Not found"));
    });

    it("replaces text in file", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "hello world" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "str_replace", path: "test.txt", old_str: "world", new_str: "earth" },
        context
      );
      assert.equal(result.status, "replaced");
      assert.ok(result.content.includes("hello earth"));
    });

    it("inserts text at line", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "line1\nline2" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "insert", path: "test.txt", insert_line: 1, new_str: "inserted" },
        context
      );
      assert.equal(result.status, "inserted");
      assert.ok(result.content.includes("inserted"));
    });

    it("deletes a file", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      await toolImplementations.editor(
        { command: "create", path: "test.txt", file_text: "bye" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "delete", path: "test.txt" },
        context
      );
      assert.equal(result.status, "deleted");
    });

    it("renames a file", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      await toolImplementations.editor(
        { command: "create", path: "old.txt", file_text: "content" },
        context
      );
      const result = await toolImplementations.editor(
        { command: "rename", path: "old.txt", new_path: "new.txt" },
        context
      );
      assert.equal(result.status, "renamed");
      const view = await toolImplementations.editor({ command: "view", path: "new.txt" }, context);
      assert.equal(view.status, "viewed");
      assert.equal(view.content, "content");
    });

    it("requires path parameter", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      const result = await toolImplementations.editor({ command: "view" }, context);
      assert.equal(result.status, "error");
    });

    it("requires command parameter", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };
      const result = await toolImplementations.editor({ path: "test.txt" }, context);
      assert.equal(result.status, "error");
    });
  });

  describe("think tool", () => {
    it("returns thinking complete without side effects", async () => {
      const result = await toolImplementations.think({ thought: "This is a test thought" });
      assert.equal(result, "Thinking complete.");
    });
  });
});
