import assert from "node:assert";
import { test } from "node:test";

import { User, Agent, Thread, Message, Resource, Vector } from "../services/database.js";
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
      const agent = await svc.createAgent(testUser.id, { name: "Test Agent", tools: ["search"] });
      assert.ok(agent.id);
      assert.strictEqual(agent.name, "Test Agent");
      assert.deepStrictEqual(agent.tools, ["search"]);
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

    await at.test("deleteAgent cascades to threads", async () => {
      // Create a thread under this agent
      const thread = await svc.createThread(testUser.id, { agentId, name: "Agent Thread" });
      const msg = await svc.addMessage(testUser.id, thread.id, {
        role: "user",
        content: [{ text: "hello" }],
      });

      await svc.deleteAgent(testUser.id, agentId);

      const deletedAgent = await svc.getAgent(testUser.id, agentId);
      assert.strictEqual(deletedAgent, null);

      const deletedThread = await svc.getThread(testUser.id, thread.id);
      assert.strictEqual(deletedThread, null);
    });
  });

  // ===== THREAD CRUD =====

  await t.test("Thread CRUD", async (tt) => {
    let threadId;

    await tt.test("createThread", async () => {
      const thread = await svc.createThread(testUser.id, { name: "Test Thread" });
      assert.ok(thread.id);
      assert.strictEqual(thread.name, "Test Thread");
      threadId = thread.id;
    });

    await tt.test("getThread", async () => {
      const thread = await svc.getThread(testUser.id, threadId);
      assert.ok(thread);
      assert.strictEqual(thread.name, "Test Thread");
    });

    await tt.test("getThreads with pagination", async () => {
      // Create extra threads
      await svc.createThread(testUser.id, { name: "Thread 2" });
      await svc.createThread(testUser.id, { name: "Thread 3" });

      const { count, rows } = await svc.getThreads(testUser.id, { limit: 2, offset: 0 });
      assert.ok(count >= 3);
      assert.strictEqual(rows.length, 2);
    });

    await tt.test("updateThread", async () => {
      const updated = await svc.updateThread(testUser.id, threadId, { name: "Updated Thread" });
      assert.ok(updated);
      assert.strictEqual(updated.name, "Updated Thread");
    });

    await tt.test("deleteThread cascades to messages, resources, vectors", async () => {
      // Create associated records
      await svc.addMessage(testUser.id, threadId, {
        role: "user",
        content: [{ text: "test" }],
      });
      await svc.addResource(testUser.id, {
        threadId,
        name: "test.txt",
        type: "text/plain",
        content: "hello",
      });
      await svc.addVectors(testUser.id, threadId, [
        { text: "vector text", embedding: [0.1, 0.2] },
      ]);

      await svc.deleteThread(testUser.id, threadId);

      const thread = await svc.getThread(testUser.id, threadId);
      assert.strictEqual(thread, null);

      const messages = await svc.getMessages(testUser.id, threadId);
      assert.strictEqual(messages.length, 0);

      const resources = await svc.getResourcesByThread(testUser.id, threadId);
      assert.strictEqual(resources.length, 0);

      const vectors = await svc.getVectorsByThread(testUser.id, threadId);
      assert.strictEqual(vectors.length, 0);
    });
  });

  // ===== MESSAGE CRUD =====

  await t.test("Message CRUD", async (mt) => {
    let threadId;
    let messageId;

    await mt.test("setup thread", async () => {
      const thread = await svc.createThread(testUser.id, { name: "Message Test Thread" });
      threadId = thread.id;
    });

    await mt.test("addMessage", async () => {
      const msg = await svc.addMessage(testUser.id, threadId, {
        role: "user",
        content: [{ text: "Hello" }],
      });
      assert.ok(msg.id);
      assert.strictEqual(msg.role, "user");
      messageId = msg.id;
    });

    await mt.test("getMessage", async () => {
      const msg = await svc.getMessage(testUser.id, messageId);
      assert.ok(msg);
      assert.strictEqual(msg.role, "user");
    });

    await mt.test("getMessages by thread", async () => {
      // Add another message
      await svc.addMessage(testUser.id, threadId, {
        role: "assistant",
        content: [{ text: "Hi there" }],
      });

      const messages = await svc.getMessages(testUser.id, threadId);
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

  // ===== RESOURCE CRUD =====

  await t.test("Resource CRUD", async (rt) => {
    let threadId;
    let resourceId;

    await rt.test("setup thread", async () => {
      const thread = await svc.createThread(testUser.id, { name: "Resource Test Thread" });
      threadId = thread.id;
    });

    await rt.test("addResource", async () => {
      const resource = await svc.addResource(testUser.id, {
        threadId,
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

    await rt.test("getResourcesByThread", async () => {
      const resources = await svc.getResourcesByThread(testUser.id, threadId);
      assert.ok(resources.length >= 1);
    });

    await rt.test("deleteResource cascades vectors", async () => {
      // Add vectors linked to resource
      await svc.addVectors(testUser.id, threadId, [
        { resourceId, text: "chunk 1", embedding: [0.1] },
        { resourceId, text: "chunk 2", embedding: [0.2] },
      ]);

      await svc.deleteResource(testUser.id, resourceId);

      const resource = await svc.getResource(testUser.id, resourceId);
      assert.strictEqual(resource, null);

      const vectors = await svc.getVectorsByResource(testUser.id, resourceId);
      assert.strictEqual(vectors.length, 0);
    });
  });

  // ===== VECTOR OPERATIONS =====

  await t.test("Vector operations", async (vt) => {
    let threadId;
    let resourceId;

    await vt.test("setup thread and resource", async () => {
      const thread = await svc.createThread(testUser.id, { name: "Vector Test Thread" });
      threadId = thread.id;
      const resource = await svc.addResource(testUser.id, {
        threadId,
        name: "vec-doc.txt",
        type: "text/plain",
        content: "vector test content",
      });
      resourceId = resource.id;
    });

    await vt.test("addVectors", async () => {
      const vectors = await svc.addVectors(testUser.id, threadId, [
        { resourceId, text: "chunk A", embedding: [0.1, 0.2, 0.3] },
        { resourceId, text: "chunk B", embedding: [0.4, 0.5, 0.6] },
        { text: "standalone", embedding: [0.7, 0.8, 0.9] },
      ]);
      assert.strictEqual(vectors.length, 3);
    });

    await vt.test("getVectorsByThread", async () => {
      const vectors = await svc.getVectorsByThread(testUser.id, threadId);
      assert.ok(vectors.length >= 3);
    });

    await vt.test("getVectorsByResource", async () => {
      const vectors = await svc.getVectorsByResource(testUser.id, resourceId);
      assert.strictEqual(vectors.length, 2);
      assert.ok(vectors[0].text === "chunk A" || vectors[0].text === "chunk B");
    });

    await vt.test("deleteVectorsByThread", async () => {
      const count = await svc.deleteVectorsByThread(testUser.id, threadId);
      assert.ok(count >= 3);

      const vectors = await svc.getVectorsByThread(testUser.id, threadId);
      assert.strictEqual(vectors.length, 0);
    });
  });
});
