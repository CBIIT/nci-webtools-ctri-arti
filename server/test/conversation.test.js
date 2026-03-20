import "../test-support/db.js";
import db, { Agent, Guardrail, User, Conversation, Message } from "database";
import assert from "node:assert";
import { test } from "node:test";

import { ConversationService } from "cms/core/conversation-service.js";
import { eq } from "drizzle-orm";
import { NOVA_EMBEDDING_DIMENSIONS } from "shared/embeddings.js";

const svc = new ConversationService();

function embeddingOf(...values) {
  return Array.from({ length: NOVA_EMBEDDING_DIMENSIONS }, (_, index) => values[index] ?? 0);
}

function mockEmbeddingFor(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return embeddingOf(hash / 2147483647, ((hash * 17) % 1000) / 1000, ((hash * 97) % 1000) / 1000);
}

test("ConversationService", async (t) => {
  let testUser;

  const originalEmbedContent = svc.embedContent;
  svc.embedContent = async ({ content }) => ({
    embeddings: content.map((item) => mockEmbeddingFor(item)),
  });
  t.after(() => {
    svc.embedContent = originalEmbedContent;
  });

  await t.test("setup: get test user", async () => {
    [testUser] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(testUser, "Test user should exist from seed");
  });

  // ===== AGENT CRUD =====

  await t.test("Agent CRUD", async (at) => {
    let agentId;

    await at.test("createAgent", async () => {
      const agent = await svc.createAgent(testUser.id, { name: "Test Agent" });
      assert.ok(agent.id);
      assert.strictEqual(agent.name, "Test Agent");
      agentId = agent.id;
    });

    await at.test("getAgent (own)", async () => {
      const agent = await svc.getAgent(testUser.id, agentId);
      assert.ok(agent);
      assert.strictEqual(agent.name, "Test Agent");
      assert.ok(agent.runtime);
      assert.strictEqual(typeof agent.runtime.model, "string");
      assert.strictEqual(agent.runtime.guardrailConfig, null);
    });

    await at.test("getAgents lists user and global agents", async () => {
      const agents = await svc.getAgents(testUser.id);
      assert.ok(agents.length >= 1);
      const found = agents.find((a) => a.id === agentId);
      assert.ok(found);
      assert.strictEqual(typeof found.runtime?.model, "string");
    });

    await at.test("resolveAgentRuntimeConfig uses saved model and explicit override", async () => {
      const resolved = await svc.resolveAgentRuntimeConfig(testUser.id, agentId);
      assert.ok(resolved);
      assert.strictEqual(resolved.agent.id, agentId);
      assert.strictEqual(resolved.runtime.effectiveModel, resolved.agent.runtime.model);

      const overridden = await svc.resolveAgentRuntimeConfig(testUser.id, agentId, {
        modelOverride: "override-model",
      });
      assert.strictEqual(overridden.runtime.overrideModel, "override-model");
      assert.strictEqual(overridden.runtime.effectiveModel, "override-model");
    });

    await at.test("global FedPulse exposes its linked guardrail runtime", async () => {
      const fedPulse = (await svc.getAgents(null)).find((agent) => agent.name === "FedPulse");
      assert.ok(fedPulse, "FedPulse should exist in seeded global agents");
      assert.equal(fedPulse.guardrailID, 1);
      assert.equal(fedPulse.runtime.guardrailID, 1);
      assert.equal(fedPulse.runtime.guardrailConfig, null);

      const [guardrail] = await db
        .select()
        .from(Guardrail)
        .where(eq(Guardrail.id, fedPulse.guardrailID))
        .limit(1);
      assert.ok(guardrail, "FedPulse guardrail should exist in seed data");
      assert.equal(guardrail.name, "FedPulse Prompt Attack");
    });

    await at.test("getAgents with null userId only lists global agents", async () => {
      const agents = await svc.getAgents(null);
      assert.ok(agents.length >= 1);
      assert.ok(agents.every((agent) => agent.userID === null));
      assert.ok(!agents.some((agent) => agent.id === agentId));
    });

    await at.test("global agents cannot be updated or deleted", async () => {
      const [globalAgent] = await db
        .insert(Agent)
        .values({
          userID: null,
          name: `Global immutability agent ${Date.now()}`,
        })
        .returning();

      try {
        await assert.rejects(
          () => svc.updateAgent(testUser.id, globalAgent.id, { name: "Should not persist" }),
          (error) => error?.message === "Cannot modify global agent" && error?.statusCode === 403
        );

        await assert.rejects(
          () => svc.deleteAgent(testUser.id, globalAgent.id),
          (error) => error?.message === "Cannot modify global agent" && error?.statusCode === 403
        );
      } finally {
        await db.delete(Agent).where(eq(Agent.id, globalAgent.id));
      }
    });

    await at.test("updateAgent", async () => {
      const updated = await svc.updateAgent(testUser.id, agentId, { name: "Updated Agent" });
      assert.ok(updated);
      assert.strictEqual(updated.name, "Updated Agent");
    });

    await at.test("deleteAgent cascades to conversations", async () => {
      // Create a conversation under this agent
      const conversation = await svc.createConversation(testUser.id, {
        agentId,
        title: "Agent Conversation",
      });
      const _msg = await svc.appendConversationMessage(testUser.id, {
        conversationId: conversation.id,
        role: "user",
        content: [{ text: "hello" }],
      });

      await svc.deleteAgent(testUser.id, agentId);

      const deletedAgent = await svc.getAgent(testUser.id, agentId);
      assert.strictEqual(deletedAgent, null);

      // Soft-deleted conversation should not be found
      const deletedConversation = await svc.getConversation(testUser.id, conversation.id);
      assert.strictEqual(deletedConversation, null);

      const [rawConversation] = await db
        .select()
        .from(Conversation)
        .where(eq(Conversation.id, conversation.id))
        .limit(1);
      assert.ok(rawConversation);
      assert.strictEqual(rawConversation.deleted, true);
      assert.strictEqual(rawConversation.agentID, null);
    });
  });

  // ===== CONVERSATION CRUD =====

  await t.test("Conversation CRUD", async (ct) => {
    let conversationId;

    await ct.test("createConversation", async () => {
      const conversation = await svc.createConversation(testUser.id, {
        title: "Test Conversation",
      });
      assert.ok(conversation.id);
      assert.strictEqual(conversation.title, "Test Conversation");
      assert.strictEqual(conversation.deleted, false);
      conversationId = conversation.id;
    });

    await ct.test("createConversation uses canonical agentId", async () => {
      const agent = await svc.createAgent(testUser.id, { name: "Legacy alias conversation agent" });
      try {
        const conversation = await svc.createConversation(testUser.id, {
          title: "Canonical agentId is supported",
          agentId: agent.id,
        });
        assert.equal(conversation.agentID, agent.id);
      } finally {
        await svc.deleteAgent(testUser.id, agent.id);
      }
    });

    await ct.test("getConversation", async () => {
      const conversation = await svc.getConversation(testUser.id, conversationId);
      assert.ok(conversation);
      assert.strictEqual(conversation.title, "Test Conversation");
    });

    await ct.test("getConversations with pagination", async () => {
      // Create extra conversations
      await svc.createConversation(testUser.id, { title: "Conversation 2" });
      await svc.createConversation(testUser.id, { title: "Conversation 3" });

      const { data, meta } = await svc.getConversations(testUser.id, { limit: 2, offset: 0 });
      assert.ok(meta.total >= 3);
      assert.strictEqual(meta.limit, 2);
      assert.strictEqual(meta.offset, 0);
      assert.strictEqual(data.length, 2);
    });

    await ct.test("updateConversation", async () => {
      const updated = await svc.updateConversation(testUser.id, conversationId, {
        title: "Updated Conversation",
      });
      assert.ok(updated);
      assert.strictEqual(updated.title, "Updated Conversation");
    });

    await ct.test("deleteConversation soft deletes", async () => {
      await svc.deleteConversation(testUser.id, conversationId);

      // Should not be found via normal get (filters deleted: false)
      const conversation = await svc.getConversation(testUser.id, conversationId);
      assert.strictEqual(conversation, null);

      // But should still exist in DB with deleted flag
      const [raw] = await db
        .select()
        .from(Conversation)
        .where(eq(Conversation.id, conversationId))
        .limit(1);
      assert.ok(raw);
      assert.strictEqual(raw.deleted, true);
      assert.ok(raw.deletedAt);
    });
  });

  // ===== MESSAGE CRUD =====

  await t.test("Message CRUD", async (mt) => {
    let conversationId;
    let messageId;

    await mt.test("setup conversation", async () => {
      const conversation = await svc.createConversation(testUser.id, {
        title: "Message Test Conversation",
      });
      conversationId = conversation.id;
    });

    await mt.test("appendConversationMessage with user role", async () => {
      const msg = await svc.appendConversationMessage(testUser.id, {
        conversationId,
        role: "user",
        content: [{ text: "Hello" }],
      });
      assert.ok(msg.id);
      assert.strictEqual(msg.role, "user");
      messageId = msg.id;
    });

    await mt.test("appendConversationMessage with assistant role and parentID", async () => {
      const msg = await svc.appendConversationMessage(testUser.id, {
        conversationId,
        role: "assistant",
        content: [{ text: "Hi there" }],
        parentID: messageId,
      });
      assert.strictEqual(msg.parentID, messageId);
    });

    await mt.test("appendConversationMessage with tool results", async () => {
      const msg = await svc.appendConversationMessage(testUser.id, {
        conversationId,
        role: "user",
        content: [
          {
            toolResult: {
              toolUseId: "tool_test_1",
              content: [{ json: { ok: true } }],
            },
          },
        ],
      });
      assert.strictEqual(msg.role, "user");
      assert.strictEqual(msg.content[0].toolResult.toolUseId, "tool_test_1");
    });

    await mt.test("appendConversationMessage rejects user toolUse rows", async () => {
      await assert.rejects(
        svc.appendConversationMessage(testUser.id, {
          conversationId,
          role: "user",
          content: [
            {
              toolUse: {
                toolUseId: "tool_invalid_user",
                name: "search",
                input: { query: "bad" },
              },
            },
          ],
        }),
        /User messages cannot contain tool uses/
      );
    });

    await mt.test("appendConversationMessage rejects assistant toolResult rows", async () => {
      await assert.rejects(
        svc.appendConversationMessage(testUser.id, {
          conversationId,
          role: "assistant",
          content: [
            {
              toolResult: {
                toolUseId: "tool_invalid_assistant",
                content: [{ json: { ok: false } }],
              },
            },
          ],
        }),
        /Assistant messages cannot contain tool results/
      );
    });

    await mt.test("getMessage", async () => {
      const msg = await svc.getMessage(testUser.id, messageId);
      assert.ok(msg);
      assert.strictEqual(msg.role, "user");
    });

    await mt.test("getMessages by conversation", async () => {
      const messages = await svc.getMessages(testUser.id, conversationId);
      assert.ok(messages.length >= 2);
      // Ordered by insert sequence
      assert.strictEqual(messages[0].role, "user");
      assert.strictEqual(messages[1].role, "assistant");
    });

    await mt.test(
      "getMessages preserves tool turn order even when timestamps disagree",
      async () => {
        const conversation = await svc.createConversation(testUser.id, {
          title: "Tool Ordering Test",
        });

        const [assistantToolUse] = await db
          .insert(Message)
          .values({
            conversationID: conversation.id,
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "tool_1",
                  name: "search",
                  input: { query: "nci" },
                },
              },
            ],
            createdAt: new Date("2026-01-01T00:00:02.000Z"),
          })
          .returning();

        const [toolResults] = await db
          .insert(Message)
          .values({
            conversationID: conversation.id,
            role: "user",
            content: [
              {
                toolResult: {
                  toolUseId: "tool_1",
                  content: [{ json: { results: [{ title: "NCI" }] } }],
                },
              },
            ],
            createdAt: new Date("2026-01-01T00:00:01.000Z"),
          })
          .returning();

        const [assistantFinal] = await db
          .insert(Message)
          .values({
            conversationID: conversation.id,
            role: "assistant",
            content: [{ text: "Done" }],
            createdAt: new Date("2026-01-01T00:00:03.000Z"),
          })
          .returning();

        const messages = await svc.getMessages(testUser.id, conversation.id);
        assert.deepStrictEqual(
          messages.map((message) => message.id),
          [assistantToolUse.id, toolResults.id, assistantFinal.id],
          "messages should follow insert order so tool results stay paired with the preceding tool use"
        );
      }
    );

    await mt.test("updateMessage", async () => {
      const updated = await svc.updateMessage(testUser.id, messageId, {
        content: [{ text: "Updated" }],
      });
      assert.ok(updated);
      assert.deepStrictEqual(updated.content, [{ text: "Updated" }]);
    });

    await mt.test("updateMessage rejects malformed tool role changes", async () => {
      await assert.rejects(
        svc.updateMessage(testUser.id, messageId, {
          content: [
            {
              toolUse: {
                toolUseId: "tool_invalid_update",
                name: "editor",
                input: { command: "view", path: "notes.txt" },
              },
            },
          ],
        }),
        /User messages cannot contain tool uses/
      );
    });

    await mt.test("deleteMessage", async () => {
      const count = await svc.deleteMessage(testUser.id, messageId);
      assert.strictEqual(count, 1);
      const msg = await svc.getMessage(testUser.id, messageId);
      assert.strictEqual(msg, null);
    });
  });

  // ===== CONTEXT METHOD =====

  await t.test("getContext", async (ct) => {
    let conversationId;

    await ct.test("setup conversation with messages and resources", async () => {
      const conversation = await svc.createConversation(testUser.id, { title: "Context Test" });
      conversationId = conversation.id;
      const msg1 = await svc.appendConversationMessage(testUser.id, {
        conversationId,
        role: "user",
        content: [{ text: "q1" }],
      });
      await svc.appendConversationMessage(testUser.id, {
        conversationId,
        role: "assistant",
        content: [{ text: "a1" }],
      });
      await svc.storeConversationResource(testUser.id, {
        messageId: msg1.id,
        name: "doc.txt",
        type: "text/plain",
        content: "doc content",
      });
    });

    await ct.test("returns conversation, messages, and resources", async () => {
      const context = await svc.getContext(testUser.id, conversationId);
      assert.ok(context);
      assert.ok(context.conversation);
      assert.strictEqual(context.messages.length, 2);
      assert.strictEqual(context.resources.length, 1);
    });

    await ct.test("getContext also preserves insert order for tool turns", async () => {
      const conversation = await svc.createConversation(testUser.id, {
        title: "Context Ordering Test",
      });

      const [assistantToolUse] = await db
        .insert(Message)
        .values({
          conversationID: conversation.id,
          role: "assistant",
          content: [
            {
              toolUse: {
                toolUseId: "tool_2",
                name: "search",
                input: { query: "context" },
              },
            },
          ],
          createdAt: new Date("2026-01-01T00:00:02.000Z"),
        })
        .returning();

      const [toolResults] = await db
        .insert(Message)
        .values({
          conversationID: conversation.id,
          role: "user",
          content: [
            {
              toolResult: {
                toolUseId: "tool_2",
                content: [{ json: { results: [{ title: "Context" }] } }],
              },
            },
          ],
          createdAt: new Date("2026-01-01T00:00:01.000Z"),
        })
        .returning();

      const context = await svc.getContext(testUser.id, conversation.id);
      assert.deepStrictEqual(
        context.messages.map((message) => message.id),
        [assistantToolUse.id, toolResults.id],
        "context messages should keep tool results immediately after the matching tool use"
      );
    });

    await ct.test("returns null for non-existent conversation", async () => {
      const context = await svc.getContext(testUser.id, 99999);
      assert.strictEqual(context, null);
    });
  });

  // ===== RESOURCE CRUD =====

  await t.test("Resource CRUD", async (rt) => {
    let agentId;
    let resourceId;

    await rt.test("setup agent", async () => {
      const agent = await svc.createAgent(testUser.id, { name: "Resource Test Agent" });
      agentId = agent.id;
    });

    await rt.test(
      "storeConversationResource allows user resources under global agents",
      async () => {
        const [globalAgent] = await svc.getAgents(null);
        assert.ok(globalAgent, "expected at least one global agent from seed data");

        const resource = await svc.storeConversationResource(testUser.id, {
          agentId: globalAgent.id,
          name: "memories/profile.txt",
          type: "text/plain",
          content: "preferred editor behavior",
        });

        assert.ok(resource.id);
        assert.strictEqual(resource.agentID, globalAgent.id);
        assert.strictEqual(resource.userID, testUser.id);

        await svc.deleteConversationResource(testUser.id, resource.id);
      }
    );

    await rt.test("storeConversationResource rejects legacy direct-mode aliases", async () => {
      await assert.rejects(
        svc.storeConversationResource(testUser.id, {
          agentID: agentId,
          name: "legacy.txt",
          type: "text/plain",
          content: "legacy alias should fail",
        }),
        (error) =>
          error?.statusCode === 400 &&
          error?.message?.includes("Resource input must use canonical field names")
      );
    });

    await rt.test("storeConversationResource", async () => {
      const resource = await svc.storeConversationResource(testUser.id, {
        agentId: agentId,
        name: "document.txt",
        type: "text/plain",
        content: "file content",
        metadata: { pages: 1 },
      });
      assert.ok(resource.id);
      assert.strictEqual(resource.name, "document.txt");
      resourceId = resource.id;
    });

    await rt.test("getResource", async () => {
      const resource = await svc.getResource(testUser.id, resourceId);
      assert.ok(resource);
      assert.strictEqual(resource.content, "file content");
    });

    await rt.test("getResourcesByAgent", async () => {
      const resources = await svc.getResourcesByAgent(testUser.id, agentId);
      assert.ok(resources.length >= 1);
    });

    await rt.test("storeConversationResource indexes text into vectors", async () => {
      const vectors = await svc.getVectorsByResource(testUser.id, resourceId);
      assert.strictEqual(vectors.length, 1);
      assert.strictEqual(vectors[0].content, "file content");
      assert.strictEqual(vectors[0].embedding.length, NOVA_EMBEDDING_DIMENSIONS);
    });

    await rt.test("updateConversationResource reindexes vectors when content changes", async () => {
      await svc.updateConversationResource(testUser.id, resourceId, {
        content: "updated file content",
      });
      const vectors = await svc.getVectorsByResource(testUser.id, resourceId);
      assert.strictEqual(vectors.length, 1);
      assert.strictEqual(vectors[0].content, "updated file content");
      assert.strictEqual(vectors[0].embedding.length, NOVA_EMBEDDING_DIMENSIONS);
    });

    await rt.test("deleteConversationResource cascades vectors", async () => {
      // Create a conversation for vectors (vectors still use conversationID)
      const conv = await svc.createConversation(testUser.id, { title: "Resource Vector Test" });
      await svc.storeConversationVectors(testUser.id, {
        conversationId: conv.id,
        vectors: [
          { resourceID: resourceId, content: "chunk 1", embedding: embeddingOf(0.1) },
          { resourceID: resourceId, content: "chunk 2", embedding: embeddingOf(0.2) },
        ],
      });

      await svc.deleteConversationResource(testUser.id, resourceId);

      const resource = await svc.getResource(testUser.id, resourceId);
      assert.strictEqual(resource, null);

      const vectors = await svc.getVectorsByResource(testUser.id, resourceId);
      assert.strictEqual(vectors.length, 0);
    });
  });

  // ===== TOOL CRUD =====

  await t.test("Tool CRUD", async (tt) => {
    let toolId;

    await tt.test("createTool", async () => {
      const tool = await svc.createTool({
        name: "test-tool",
        description: "A test tool",
        type: "custom",
      });
      assert.ok(tool.id);
      assert.strictEqual(tool.name, "test-tool");
      toolId = tool.id;
    });

    await tt.test("getTool", async () => {
      const tool = await svc.getTool(toolId);
      assert.ok(tool);
      assert.strictEqual(tool.description, "A test tool");
    });

    await tt.test("getTools includes builtins", async () => {
      const tools = await svc.getTools(testUser.id);
      assert.ok(tools.length >= 7); // 7 builtin tools from seed
    });

    await tt.test("updateTool", async () => {
      const updated = await svc.updateTool(toolId, { description: "Updated description" });
      assert.ok(updated);
      assert.strictEqual(updated.description, "Updated description");
    });

    await tt.test("deleteTool", async () => {
      await svc.deleteTool(toolId);
      const tool = await svc.getTool(toolId);
      assert.strictEqual(tool, null);
    });
  });

  // ===== PROMPT CRUD =====

  await t.test("Prompt CRUD", async (pt) => {
    let promptId;
    let agentId;

    await pt.test("createPrompt", async () => {
      const prompt = await svc.createPrompt({
        name: "test-prompt",
        version: 1,
        content: "You are a test assistant.",
      });
      assert.ok(prompt.id);
      assert.strictEqual(prompt.name, "test-prompt");
      promptId = prompt.id;
    });

    await pt.test("getPrompt", async () => {
      const prompt = await svc.getPrompt(promptId);
      assert.ok(prompt);
      assert.strictEqual(prompt.content, "You are a test assistant.");
    });

    await pt.test("getPrompts", async () => {
      const prompts = await svc.getPrompts();
      assert.ok(prompts.length >= 1);
    });

    await pt.test("updatePrompt", async () => {
      const updated = await svc.updatePrompt(promptId, { content: "Updated prompt." });
      assert.ok(updated);
      assert.strictEqual(updated.content, "Updated prompt.");
    });

    await pt.test("deletePrompt", async () => {
      const agent = await svc.createAgent(testUser.id, {
        name: "Prompt Owner Agent",
        promptID: promptId,
      });
      agentId = agent.id;

      await svc.deletePrompt(promptId);
      const prompt = await svc.getPrompt(promptId);
      assert.strictEqual(prompt, null);

      const updatedAgent = await svc.getAgent(testUser.id, agentId);
      assert.ok(updatedAgent);
      assert.strictEqual(updatedAgent.promptID, null);
      assert.strictEqual(updatedAgent.systemPrompt, null);
      assert.strictEqual(updatedAgent.runtime.systemPrompt, null);
    });
  });

  // ===== SEARCH METHODS =====

  await t.test("Search methods", async (st) => {
    let agentId;
    let otherAgentId;
    let conversationId;
    let otherConversationId;
    let resourceId;

    await st.test("setup: create conversation, messages, resource, and vectors", async () => {
      const agent = await svc.createAgent(testUser.id, { name: "Recall Search Agent" });
      const otherAgent = await svc.createAgent(testUser.id, { name: "Other Search Agent" });
      agentId = agent.id;
      otherAgentId = otherAgent.id;

      const conversation = await svc.createConversation(testUser.id, {
        title: "Search Test Conversation",
        agentId,
      });
      conversationId = conversation.id;

      await svc.appendConversationMessage(testUser.id, {
        conversationId,
        role: "user",
        content: [{ text: "The capital of France is Paris" }],
      });
      await svc.appendConversationMessage(testUser.id, {
        conversationId,
        role: "assistant",
        content: [{ text: "That is correct. Paris is indeed the capital of France." }],
      });

      const otherConversation = await svc.createConversation(testUser.id, {
        title: "Other Agent Search Conversation",
        agentId: otherAgentId,
      });
      otherConversationId = otherConversation.id;
      await svc.appendConversationMessage(testUser.id, {
        conversationId: otherConversationId,
        role: "user",
        content: [{ text: "France also appears in this other agent conversation." }],
      });

      const resource = await svc.storeConversationResource(testUser.id, {
        agentId: otherAgentId,
        name: "geography.txt",
        type: "text/plain",
        content: "France is a country in Western Europe. Its capital is Paris.",
      });
      resourceId = resource.id;
      await svc.deleteVectorsByResource(testUser.id, resourceId);

      await svc.storeConversationVectors(testUser.id, {
        conversationId,
        vectors: [
          {
            resourceID: resourceId,
            content: "France is a country in Western Europe",
            embedding: embeddingOf(0.9, 0.1, 0.1),
          },
          {
            resourceID: resourceId,
            content: "Its capital is Paris",
            embedding: embeddingOf(0.8, 0.2, 0.1),
          },
          {
            resourceID: resourceId,
            content: "Quantum physics studies subatomic particles",
            embedding: embeddingOf(0.1, 0.1, 0.9),
          },
        ],
      });
    });

    await st.test("searchMessages finds matching text", async () => {
      const results = await svc.searchMessages(testUser.id, { query: "France", agentId });
      assert.ok(results.length >= 1, `expected at least 1 result, got ${results.length}`);
      const match = results.find((r) => r.matchingText.includes("France"));
      assert.ok(match, "should find message mentioning France");
      assert.ok(
        results.every((r) => r.conversationId === conversationId),
        "should only search messages from the current agent's conversations"
      );
    });

    await st.test("searchMessages with future dateFrom returns no results", async () => {
      const results = await svc.searchMessages(testUser.id, {
        query: "France",
        agentId,
        dateFrom: "2099-01-01",
      });
      assert.strictEqual(results.length, 0, "future dateFrom should filter out all results");
    });

    await st.test("searchResourceVectors ranks by cosine similarity", async () => {
      const queryEmbedding = embeddingOf(0.85, 0.15, 0.1); // close to "France" vector
      const results = await svc.searchResourceVectors(testUser.id, {
        embedding: queryEmbedding,
        topN: 3,
      });
      assert.ok(results.length >= 2, `expected at least 2 results, got ${results.length}`);
      assert.ok(
        results[0].similarity > results[results.length - 1].similarity,
        "results should be ranked by similarity"
      );
      assert.ok(
        results[0].content.includes("France") || results[0].content.includes("Paris"),
        "top result should be about France/Paris"
      );
    });

    await st.test("searchChunks finds matching chunk content", async () => {
      const results = await svc.searchChunks(testUser.id, { query: "capital" });
      assert.ok(results.length >= 1, `expected at least 1 result, got ${results.length}`);
      const match = results.find((r) => r.content.includes("capital"));
      assert.ok(match, "should find chunk mentioning capital");
    });

    await st.test("searchChunks with future dateFrom returns no results", async () => {
      const results = await svc.searchChunks(testUser.id, {
        query: "capital",
        dateFrom: "2099-01-01",
      });
      assert.strictEqual(results.length, 0, "future dateFrom should filter out all results");
    });
  });

  // ===== VECTOR OPERATIONS =====

  await t.test("Vector operations", async (vt) => {
    let conversationId;
    let resourceId;

    await vt.test("setup conversation and resource", async () => {
      const conversation = await svc.createConversation(testUser.id, {
        title: "Vector Test Conversation",
      });
      conversationId = conversation.id;
      const resource = await svc.storeConversationResource(testUser.id, {
        name: "vec-doc.txt",
        type: "text/plain",
        content: "vector test content",
      });
      resourceId = resource.id;
      await svc.deleteVectorsByResource(testUser.id, resourceId);
    });

    await vt.test("storeConversationVectors", async () => {
      const vectors = await svc.storeConversationVectors(testUser.id, {
        conversationId,
        vectors: [
          { resourceID: resourceId, content: "chunk A", embedding: embeddingOf(0.1, 0.2, 0.3) },
          { resourceID: resourceId, content: "chunk B", embedding: embeddingOf(0.4, 0.5, 0.6) },
          { content: "standalone", embedding: embeddingOf(0.7, 0.8, 0.9) },
        ],
      });
      assert.strictEqual(vectors.length, 3);
    });

    await vt.test("getVectorsByConversation", async () => {
      const vectors = await svc.getVectorsByConversation(testUser.id, conversationId);
      assert.ok(vectors.length >= 3);
    });

    await vt.test("getVectorsByResource", async () => {
      const vectors = await svc.getVectorsByResource(testUser.id, resourceId);
      assert.strictEqual(vectors.length, 2);
      assert.ok(vectors[0].content === "chunk A" || vectors[0].content === "chunk B");
    });

    await vt.test("searchVectors with cosine similarity", async () => {
      const results = await svc.searchVectors({
        conversationId,
        embedding: embeddingOf(0.1, 0.2, 0.3),
        topN: 2,
      });
      assert.ok(results.length <= 2);
      assert.ok(results[0].similarity !== undefined);
      // First result should be most similar to [0.1, 0.2, 0.3]
      assert.ok(results[0].similarity >= results[results.length - 1].similarity);
    });

    await vt.test("deleteVectorsByConversation", async () => {
      const count = await svc.deleteVectorsByConversation(testUser.id, conversationId);
      assert.ok(count >= 3);

      const vectors = await svc.getVectorsByConversation(testUser.id, conversationId);
      assert.strictEqual(vectors.length, 0);
    });
  });

  await t.test("Ownership invariants", async (ot) => {
    let otherUser;
    let foreignConversationId;
    let foreignMessageId;
    let foreignResourceId;

    await ot.test("setup foreign user fixtures", async () => {
      const email = `conversation-owner-${Date.now()}-${Math.random()}@test.com`;
      [otherUser] = await db
        .insert(User)
        .values({
          email,
          firstName: "Other",
          lastName: "User",
          status: "active",
          roleID: 3,
          budget: 5,
          remaining: 5,
        })
        .returning();

      const conversation = await svc.createConversation(otherUser.id, {
        title: "Foreign Conversation",
      });
      foreignConversationId = conversation.id;

      const message = await svc.appendConversationMessage(otherUser.id, {
        conversationId: foreignConversationId,
        role: "user",
        content: [{ text: "Foreign message" }],
      });
      foreignMessageId = message.id;

      const resource = await svc.storeConversationResource(otherUser.id, {
        conversationId: foreignConversationId,
        messageId: foreignMessageId,
        name: "foreign.txt",
        type: "text/plain",
        content: "foreign resource",
      });
      foreignResourceId = resource.id;
    });

    await ot.test("appendConversationMessage rejects foreign conversation", async () => {
      const before = await svc.getMessages(otherUser.id, foreignConversationId);

      await assert.rejects(
        svc.appendConversationMessage(testUser.id, {
          conversationId: foreignConversationId,
          role: "user",
          content: [{ text: "Should not persist" }],
        }),
        /Conversation not found/
      );

      const after = await svc.getMessages(otherUser.id, foreignConversationId);
      assert.strictEqual(after.length, before.length);
    });

    await ot.test("storeConversationResource rejects foreign message ownership", async () => {
      const before = await svc.getResourcesByConversation(otherUser.id, foreignConversationId);

      await assert.rejects(
        svc.storeConversationResource(testUser.id, {
          conversationId: foreignConversationId,
          messageId: foreignMessageId,
          name: "stolen.txt",
          type: "text/plain",
          content: "Should not persist",
        }),
        /Message not found/
      );

      const after = await svc.getResourcesByConversation(otherUser.id, foreignConversationId);
      assert.strictEqual(after.length, before.length);
    });

    await ot.test("storeConversationVectors rejects foreign conversation", async () => {
      const before = await svc.getVectorsByConversation(otherUser.id, foreignConversationId);

      await assert.rejects(
        svc.storeConversationVectors(testUser.id, {
          conversationId: foreignConversationId,
          vectors: [{ content: "Should not persist", embedding: embeddingOf(0.3, 0.2, 0.1) }],
        }),
        /Conversation not found/
      );

      const after = await svc.getVectorsByConversation(otherUser.id, foreignConversationId);
      assert.strictEqual(after.length, before.length);
    });

    await ot.test("deleteVectorsByResource rejects foreign resource", async () => {
      await svc.storeConversationVectors(otherUser.id, {
        conversationId: foreignConversationId,
        vectors: [
          {
            resourceID: foreignResourceId,
            content: "Foreign chunk",
            embedding: embeddingOf(0.4, 0.5, 0.6),
          },
        ],
      });
      const before = await svc.getVectorsByResource(otherUser.id, foreignResourceId);

      await assert.rejects(
        svc.deleteVectorsByResource(testUser.id, foreignResourceId),
        /Resource not found/
      );

      const after = await svc.getVectorsByResource(otherUser.id, foreignResourceId);
      assert.strictEqual(after.length, before.length);
    });

    await ot.test("deleteVectorsByConversation rejects foreign conversation", async () => {
      const before = await svc.getVectorsByConversation(otherUser.id, foreignConversationId);

      await assert.rejects(
        svc.deleteVectorsByConversation(testUser.id, foreignConversationId),
        /Conversation not found/
      );

      const after = await svc.getVectorsByConversation(otherUser.id, foreignConversationId);
      assert.strictEqual(after.length, before.length);
    });
  });
});




