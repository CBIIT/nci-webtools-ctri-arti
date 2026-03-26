import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NOVA_EMBEDDING_DIMENSIONS } from "shared/embeddings.js";

import { getToolFn, toolImplementations } from "../tools/index.js";

function embeddingOf(...values) {
  return Array.from({ length: NOVA_EMBEDDING_DIMENSIONS }, (_, index) => values[index] ?? 0);
}

describe("tools", () => {
  describe("getToolFn", () => {
    it("returns function for known tools", () => {
      assert.equal(typeof getToolFn("search"), "function");
      assert.equal(typeof getToolFn("browse"), "function");
      assert.equal(typeof getToolFn("data"), "function");
      assert.equal(typeof getToolFn("editor"), "function");
      assert.equal(typeof getToolFn("think"), "function");
      assert.equal(typeof getToolFn("workflow"), "function");
      assert.equal(typeof getToolFn("docxTemplate"), "function");
      assert.equal(typeof getToolFn("recall"), "function");
    });

    it("returns undefined for unknown tools", () => {
      assert.equal(getToolFn("code"), undefined);
      assert.equal(getToolFn("nonexistent"), undefined);
    });
  });

  describe("toolImplementations", () => {
    it("has all expected tools", () => {
      const expected = [
        "search",
        "browse",
        "data",
        "editor",
        "think",
        "workflow",
        "docxTemplate",
        "recall",
      ];
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
        storeConversationResource: async (userId, data) => {
          const resource = { id: resources.length + 1, userID: userId, ...data };
          if (data.agentId !== undefined) resource.agentID = data.agentId;
          if (data.conversationId !== undefined) resource.conversationID = data.conversationId;
          if (data.messageId !== undefined) resource.messageID = data.messageId;
          resources.push(resource);
          return resource;
        },
        updateConversationResource: async (userId, resourceId, updates) => {
          const r = resources.find((r) => r.id === resourceId);
          if (r) Object.assign(r, updates);
          return r;
        },
        deleteConversationResource: async (userId, resourceId) => {
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

    it("lists root and empty scoped directories instead of failing", async () => {
      const cms = createMockCms();
      const context = { userId: 1, agentId: 1, conversationId: 10, cms };

      const root = await toolImplementations.editor({ command: "view", path: "/" }, context);
      assert.equal(root.status, "directory");
      assert.deepStrictEqual(root.entries, []);

      const memories = await toolImplementations.editor(
        { command: "view", path: "memories/" },
        context
      );
      assert.equal(memories.status, "directory");
      assert.deepStrictEqual(memories.entries, []);
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

  describe("recall tool", () => {
    function createMockContext(overrides = {}) {
      const calls = { searchMessages: [], searchResourceVectors: [], searchChunks: [] };
      return {
        userId: 1,
        agentId: 1,
        conversationId: 10,
        cms: {
          searchMessages: async (userId, params) => {
            calls.searchMessages.push({ userId, ...params });
            return overrides.messages || [];
          },
          searchResourceVectors: async (userId, params) => {
            calls.searchResourceVectors.push({ userId, ...params });
            return overrides.semantic || [];
          },
          searchChunks: async (userId, params) => {
            calls.searchChunks.push({ userId, ...params });
            return overrides.chunks || [];
          },
        },
        gateway: {
          embed: overrides.embed || (async () => ({ embeddings: [embeddingOf(0.1, 0.2, 0.3)] })),
        },
        _calls: calls,
      };
    }

    it("returns formatted markdown with all three sections", async () => {
      const context = createMockContext({
        messages: [
          {
            messageId: 1,
            conversationId: 10,
            agentId: 1,
            role: "user",
            createdAt: "2026-01-01",
            conversationTitle: "Test Conv",
            matchingText: "The capital of France is Paris",
          },
        ],
        semantic: [
          {
            resourceId: 11,
            conversationId: 10,
            agentId: 2,
            resourceName: "geo.txt",
            metadata: { format: "pdf", encoding: "utf-8" },
            similarity: 0.95,
            content: "France is in Western Europe",
            createdAt: "2026-01-02",
            resourceCreatedAt: "2026-01-01",
          },
        ],
        chunks: [
          {
            resourceId: 12,
            conversationId: 12,
            agentId: 3,
            resourceName: "notes.txt",
            metadata: { format: "txt", encoding: "utf-8" },
            content: "Paris is the capital",
            createdAt: "2026-01-03",
            resourceCreatedAt: "2026-01-02",
            rank: 0.75,
          },
        ],
      });

      const result = await toolImplementations.recall({ query: "France" }, context);
      assert.equal(result.query, "France");
      assert.equal(result.summary.messageCount, 1);
      assert.equal(result.summary.semanticCount, 1);
      assert.equal(result.summary.chunkCount, 1);
      assert.equal(
        result.messages[0].conversationUrl,
        "/tools/chat-v2?agentId=1&conversationId=10"
      );
      assert.equal(result.semantic[0].downloadUrl, "/api/v1/resources/11/download");
      assert.equal(result.semantic[0].downloadExact, false);
      assert.equal(result.chunks[0].downloadExact, true);
    });

    it("returns an empty structured result when all sources are empty", async () => {
      const context = createMockContext();
      const result = await toolImplementations.recall({ query: "nonexistent" }, context);
      assert.equal(result.summary.messageCount, 0);
      assert.equal(result.summary.semanticCount, 0);
      assert.equal(result.summary.chunkCount, 0);
    });

    it("passes dateFrom/dateTo through to all search methods", async () => {
      const context = createMockContext();
      await toolImplementations.recall(
        { query: "test", dateFrom: "2026-01-01", dateTo: "2026-12-31" },
        context
      );

      assert.ok(context._calls.searchMessages[0].dateFrom === "2026-01-01");
      assert.ok(context._calls.searchMessages[0].dateTo === "2026-12-31");
      assert.ok(context._calls.searchChunks[0].dateFrom === "2026-01-01");
      assert.ok(context._calls.searchChunks[0].dateTo === "2026-12-31");
    });

    it("scopes message search by agent but searches all user resources for chunks and vectors", async () => {
      const context = createMockContext();
      await toolImplementations.recall({ query: "test" }, context);

      assert.equal(context._calls.searchMessages[0].agentId, 1);
      assert.equal(context._calls.searchResourceVectors[0].agentId, undefined);
      assert.equal(context._calls.searchChunks[0].agentId, undefined);
    });

    it("handles gateway.embed failure gracefully", async () => {
      const context = createMockContext({
        embed: async () => {
          throw new Error("Embedding service unavailable");
        },
        messages: [
          {
            messageId: 1,
            conversationId: 10,
            agentId: 1,
            role: "user",
            createdAt: "2026-01-01",
            conversationTitle: "Test",
            matchingText: "Some text",
          },
        ],
      });

      const result = await toolImplementations.recall({ query: "test" }, context);
      assert.equal(result.summary.messageCount, 1, "message search should still work");
      assert.equal(result.summary.semanticCount, 0, "semantic section should be empty on error");
      assert.equal(result.errors.semantic, "Embedding service unavailable");
    });
  });

  describe("think tool", () => {
    it("returns thinking complete without side effects", async () => {
      const result = await toolImplementations.think({ thought: "This is a test thought" });
      assert.equal(result, "Thinking complete.");
    });
  });

  describe("workflow tool", () => {
    it("runs the protocol_advisor workflow through the workflow registry", async () => {
      const result = await toolImplementations.workflow({
        workflow: "protocol_advisor",
        input: {
          templateId: "interventional",
          protocolText: "1 PROTOCOL SUMMARY\nProtocol body",
        },
      });

      assert.equal(result.workflow, "protocol_advisor");
      assert.equal(result.output.status, "deterministic_review");
      assert.equal(result.output.template.templateId, "interventional");
      assert.equal(result.nodeResults.validateInput.status, "completed");
      assert.equal(result.nodeResults.aggregateReport.status, "completed");
    });
  });
});
