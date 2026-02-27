import assert from "node:assert";
import { test } from "node:test";

import { User, Agent, Conversation, Message, Resource, Vector } from "../services/database.js";
import { ConversationService } from "../services/cms/conversation.js";

const svc = new ConversationService();

test("ConversationService", async (t) => {
  let testUser;

  await t.test("setup: get test user", async () => {
    testUser = await User.findOne({ where: { email: "test@test.com" } });
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
    });

    await at.test("getAgents lists user and global agents", async () => {
      const agents = await svc.getAgents(testUser.id);
      assert.ok(agents.length >= 1);
      const found = agents.find((a) => a.id === agentId);
      assert.ok(found);
    });

    await at.test("updateAgent", async () => {
      const updated = await svc.updateAgent(testUser.id, agentId, { name: "Updated Agent" });
      assert.ok(updated);
      assert.strictEqual(updated.name, "Updated Agent");
    });

    await at.test("deleteAgent cascades to conversations", async () => {
      // Create a conversation under this agent
      const conversation = await svc.createConversation(testUser.id, { agentID: agentId, title: "Agent Conversation" });
      const msg = await svc.addMessage(testUser.id, conversation.id, {
        role: "user",
        content: [{ text: "hello" }],
      });

      await svc.deleteAgent(testUser.id, agentId);

      const deletedAgent = await svc.getAgent(testUser.id, agentId);
      assert.strictEqual(deletedAgent, null);

      // Soft-deleted conversation should not be found
      const deletedConversation = await svc.getConversation(testUser.id, conversation.id);
      assert.strictEqual(deletedConversation, null);
    });
  });

  // ===== CONVERSATION CRUD =====

  await t.test("Conversation CRUD", async (ct) => {
    let conversationId;

    await ct.test("createConversation", async () => {
      const conversation = await svc.createConversation(testUser.id, { title: "Test Conversation" });
      assert.ok(conversation.id);
      assert.strictEqual(conversation.title, "Test Conversation");
      assert.strictEqual(conversation.deleted, false);
      conversationId = conversation.id;
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

      const { count, rows } = await svc.getConversations(testUser.id, { limit: 2, offset: 0 });
      assert.ok(count >= 3);
      assert.strictEqual(rows.length, 2);
    });

    await ct.test("updateConversation", async () => {
      const updated = await svc.updateConversation(testUser.id, conversationId, { title: "Updated Conversation" });
      assert.ok(updated);
      assert.strictEqual(updated.title, "Updated Conversation");
    });

    await ct.test("deleteConversation soft deletes", async () => {
      await svc.deleteConversation(testUser.id, conversationId);

      // Should not be found via normal get (filters deleted: false)
      const conversation = await svc.getConversation(testUser.id, conversationId);
      assert.strictEqual(conversation, null);

      // But should still exist in DB with deleted flag
      const raw = await Conversation.findByPk(conversationId);
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
      const conversation = await svc.createConversation(testUser.id, { title: "Message Test Conversation" });
      conversationId = conversation.id;
    });

    await mt.test("addMessage auto-assigns serialNumber", async () => {
      const msg = await svc.addMessage(testUser.id, conversationId, {
        role: "user",
        content: [{ text: "Hello" }],
      });
      assert.ok(msg.id);
      assert.strictEqual(msg.role, "user");
      assert.strictEqual(msg.serialNumber, 1);
      messageId = msg.id;
    });

    await mt.test("addMessage increments serialNumber", async () => {
      const msg = await svc.addMessage(testUser.id, conversationId, {
        role: "assistant",
        content: [{ text: "Hi there" }],
      });
      assert.strictEqual(msg.serialNumber, 2);
    });

    await mt.test("addMessage accepts tokens param", async () => {
      const msg = await svc.addMessage(testUser.id, conversationId, {
        role: "assistant",
        content: [{ text: "response" }],
        tokens: 150,
      });
      assert.strictEqual(msg.tokens, 150);
    });

    await mt.test("getMessage", async () => {
      const msg = await svc.getMessage(testUser.id, messageId);
      assert.ok(msg);
      assert.strictEqual(msg.role, "user");
    });

    await mt.test("getMessages by conversation", async () => {
      const messages = await svc.getMessages(testUser.id, conversationId);
      assert.ok(messages.length >= 2);
      // Ordered by createdAt ASC
      assert.strictEqual(messages[0].role, "user");
      assert.strictEqual(messages[1].role, "assistant");
    });

    await mt.test("updateMessage", async () => {
      const updated = await svc.updateMessage(testUser.id, messageId, {
        content: [{ text: "Updated" }],
      });
      assert.ok(updated);
      assert.deepStrictEqual(updated.content, [{ text: "Updated" }]);
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
      await svc.addMessage(testUser.id, conversationId, { role: "user", content: [{ text: "q1" }] });
      await svc.addMessage(testUser.id, conversationId, { role: "assistant", content: [{ text: "a1" }] });
      await svc.addResource(testUser.id, {
        conversationID: conversationId,
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

    await ct.test("returns null for non-existent conversation", async () => {
      const context = await svc.getContext(testUser.id, 99999);
      assert.strictEqual(context, null);
    });
  });

  // ===== COMPRESS METHOD =====

  await t.test("compressConversation", async (ct) => {
    let conversationId;

    await ct.test("setup", async () => {
      const conversation = await svc.createConversation(testUser.id, { title: "Compress Test" });
      conversationId = conversation.id;
    });

    await ct.test("updates latestSummarySN", async () => {
      const result = await svc.compressConversation(testUser.id, conversationId, {
        summary: "summarized",
        serialNumber: 5,
      });
      assert.ok(result);
      assert.strictEqual(result.latestSummarySN, 5);
    });
  });

  // ===== RESOURCE CRUD =====

  await t.test("Resource CRUD", async (rt) => {
    let conversationId;
    let resourceId;

    await rt.test("setup conversation", async () => {
      const conversation = await svc.createConversation(testUser.id, { title: "Resource Test Conversation" });
      conversationId = conversation.id;
    });

    await rt.test("addResource", async () => {
      const resource = await svc.addResource(testUser.id, {
        conversationID: conversationId,
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

    await rt.test("getResourcesByConversation", async () => {
      const resources = await svc.getResourcesByConversation(testUser.id, conversationId);
      assert.ok(resources.length >= 1);
    });

    await rt.test("deleteResource cascades vectors", async () => {
      // Add vectors linked to resource
      await svc.addVectors(testUser.id, conversationId, [
        { resourceID: resourceId, content: "chunk 1", embedding: [0.1] },
        { resourceID: resourceId, content: "chunk 2", embedding: [0.2] },
      ]);

      await svc.deleteResource(testUser.id, resourceId);

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
      await svc.deletePrompt(promptId);
      const prompt = await svc.getPrompt(promptId);
      assert.strictEqual(prompt, null);
    });
  });

  // ===== VECTOR OPERATIONS =====

  await t.test("Vector operations", async (vt) => {
    let conversationId;
    let resourceId;

    await vt.test("setup conversation and resource", async () => {
      const conversation = await svc.createConversation(testUser.id, { title: "Vector Test Conversation" });
      conversationId = conversation.id;
      const resource = await svc.addResource(testUser.id, {
        conversationID: conversationId,
        name: "vec-doc.txt",
        type: "text/plain",
        content: "vector test content",
      });
      resourceId = resource.id;
    });

    await vt.test("addVectors", async () => {
      const vectors = await svc.addVectors(testUser.id, conversationId, [
        { resourceID: resourceId, content: "chunk A", embedding: [0.1, 0.2, 0.3] },
        { resourceID: resourceId, content: "chunk B", embedding: [0.4, 0.5, 0.6] },
        { content: "standalone", embedding: [0.7, 0.8, 0.9] },
      ]);
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
        conversationID: conversationId,
        embedding: [0.1, 0.2, 0.3],
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
});
