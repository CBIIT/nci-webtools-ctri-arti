import db, { Agent, Model, Resource, Usage, User } from "database";
import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";

import { createAgentsRouter } from "agents/api.js";
import { createAgentsApplication } from "agents/app.js";
import { createAgentsRemote } from "agents/remote.js";
import { v1Router as cmsApi } from "cms/api.js";
import { ConversationService } from "cms/conversation.js";
import { createCmsRemote } from "cms/remote.js";
import { createCmsService } from "cms/service.js";
import { eq, and } from "drizzle-orm";
import express from "express";
import gatewayApi from "gateway/api.js";
import { createGatewayRemote } from "gateway/remote.js";
import { createGatewayService } from "gateway/service.js";
import { normalizeEmbeddingUsageItems } from "shared/gateway-usage.js";
import { createAnonymousRequestContext, createUserRequestContext } from "shared/request-context.js";
import { createUsersApplication } from "users/app.js";
import { createUsersRemote } from "users/remote.js";

import usersApi from "../../users/api.js";

function createHttpApp(router, basePath = "/") {
  const app = express();
  app.use(basePath, router);
  return app;
}

async function startServer(router, basePath = "/") {
  const server = http.createServer(createHttpApp(router, basePath));
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = server.address();
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise()))
      ),
  };
}

test("transport parity", async (t) => {
  await t.test("CMS agent reads match in direct and HTTP mode for anonymous access", async () => {
    const cmsServer = await startServer(cmsApi, "/api/v1");
    const svc = new ConversationService();
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const privateAgent = await svc.createAgent(user.id, { name: "Parity Private Agent" });

    try {
      const anonymousContext = createAnonymousRequestContext({ source: "direct" });
      const directClient = createCmsService({ source: "direct" });
      const httpClient = createCmsRemote({ baseUrl: cmsServer.url });

      const [directAgents, httpAgents] = await Promise.all([
        directClient.getAgents(anonymousContext),
        httpClient.getAgents(anonymousContext),
      ]);

      assert.deepStrictEqual(
        directAgents.map((agent) => ({ id: agent.id, name: agent.name, userID: agent.userID })),
        httpAgents.map((agent) => ({ id: agent.id, name: agent.name, userID: agent.userID }))
      );
      assert.ok(directAgents.every((agent) => agent.userID === null));
      assert.equal(
        directAgents.some((agent) => agent.id === privateAgent.id),
        false
      );
    } finally {
      await svc.deleteAgent(user.id, privateAgent.id);
      await cmsServer.close();
    }
  });

  await t.test("Users getUserByEmail matches in direct and HTTP mode", async () => {
    const usersServer = await startServer(usersApi, "/api");

    try {
      const directClient = createUsersApplication();
      const httpClient = createUsersRemote({ baseUrl: usersServer.url });

      const [directUser, httpUser] = await Promise.all([
        directClient.getUserByEmail("test@test.com"),
        httpClient.getUserByEmail("test@test.com"),
      ]);

      assert.equal(httpUser.id, directUser.id);
      assert.equal(httpUser.email, directUser.email);
      assert.equal(httpUser.Role?.id, directUser.Role?.id);
    } finally {
      await usersServer.close();
    }
  });

  await t.test("Users budget reset responses match in direct and HTTP mode", async () => {
    const usersServer = await startServer(usersApi, "/api");

    const [directUser] = await db
      .insert(User)
      .values({
        email: `users-direct-reset-${Date.now()}@test.com`,
        firstName: "Users",
        lastName: "DirectReset",
        status: "active",
        roleID: 3,
        budget: 8,
        remaining: 2,
      })
      .returning();

    const [httpUser] = await db
      .insert(User)
      .values({
        email: `users-http-reset-${Date.now()}@test.com`,
        firstName: "Users",
        lastName: "HttpReset",
        status: "active",
        roleID: 3,
        budget: 11,
        remaining: 4,
      })
      .returning();

    try {
      const directClient = createUsersApplication();
      const httpClient = createUsersRemote({ baseUrl: usersServer.url });

      const [directSingleReset, httpSingleReset] = await Promise.all([
        directClient.resetUserBudget(directUser.id),
        httpClient.resetUserBudget(httpUser.id),
      ]);

      assert.equal(directSingleReset.success, true);
      assert.equal(httpSingleReset.success, true);
      assert.equal(directSingleReset.user.remaining, directSingleReset.user.budget);
      assert.equal(httpSingleReset.user.remaining, httpSingleReset.user.budget);

      await db.update(User).set({ remaining: 1 }).where(eq(User.id, directUser.id));
      await db.update(User).set({ remaining: 3 }).where(eq(User.id, httpUser.id));

      const [directBulkReset, httpBulkReset] = await Promise.all([
        directClient.resetAllBudgets(),
        httpClient.resetAllBudgets(),
      ]);

      assert.equal(directBulkReset.success, true);
      assert.equal(httpBulkReset.success, true);
      assert.equal(typeof directBulkReset.updatedUsers, "number");
      assert.equal(typeof httpBulkReset.updatedUsers, "number");
      assert.ok(directBulkReset.updatedUsers >= 1);
      assert.ok(httpBulkReset.updatedUsers >= 1);

      const [directAfter] = await db.select().from(User).where(eq(User.id, directUser.id)).limit(1);
      const [httpAfter] = await db.select().from(User).where(eq(User.id, httpUser.id)).limit(1);
      assert.equal(directAfter.remaining, directAfter.budget);
      assert.equal(httpAfter.remaining, httpAfter.budget);
    } finally {
      await usersServer.close();
    }
  });

  await t.test("Agents modelOverride behavior matches in direct and HTTP mode", async () => {
    const svc = new ConversationService();
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const agent = await svc.createAgent(user.id, {
      name: `Parity Chat Agent ${Date.now()}`,
    });
    const directConversation = await svc.createConversation(user.id, {
      title: "Agents modelOverride parity direct",
      agentID: agent.id,
    });
    const httpConversation = await svc.createConversation(user.id, {
      title: "Agents modelOverride parity http",
      agentID: agent.id,
    });

    const fakeGateway = {
      async invoke({ model, stream }) {
        const text = `reply via ${model}`;

        if (!stream) {
          return {
            content: [{ text }],
            usage: { inputTokens: 1, outputTokens: 1 },
          };
        }

        return {
          stream: (async function* () {
            yield { contentBlockDelta: { contentBlockIndex: 0, delta: { text } } };
            yield { messageStop: { stopReason: "end_turn" } };
          })(),
        };
      },
      async embed() {
        throw new Error("embed should not be called in this test");
      },
    };

    const cms = {
      getAgent: (userId, agentId) => svc.getAgent(userId, agentId),
      getConversation: (userId, conversationId) => svc.getConversation(userId, conversationId),
      appendUserMessage: (userId, data) => svc.appendUserMessage(userId, data),
      getResourcesByAgent: (userId, agentId) => svc.getResourcesByAgent(userId, agentId),
      summarize: async function* () {},
      getContext: (userId, conversationId, options) =>
        svc.getContext(userId, conversationId, options),
      appendAssistantMessage: (userId, data) => svc.appendAssistantMessage(userId, data),
      storeConversationResource: (userId, data) => svc.storeConversationResource(userId, data),
      appendToolResultsMessage: (userId, data) => svc.appendToolResultsMessage(userId, data),
    };

    const application = createAgentsApplication({
      source: "direct",
      gateway: fakeGateway,
      cms,
    });
    const agentsServer = await startServer(
      createAgentsRouter({
        application: createAgentsApplication({
          source: "internal-http",
          gateway: fakeGateway,
          cms,
        }),
      }),
      "/"
    );

    try {
      const context = createUserRequestContext(user.id, { source: "direct" });
      const httpClient = createAgentsRemote({ baseUrl: agentsServer.url });

      async function collectEvents(stream) {
        const events = [];
        for await (const event of stream) {
          events.push(event);
        }
        return events;
      }

      const [directEvents, httpEvents] = await Promise.all([
        collectEvents(
          application.chat({
            context,
            agentId: agent.id,
            conversationId: directConversation.id,
            message: { content: [{ text: "hello parity" }] },
            modelOverride: "override-parity-model",
          })
        ),
        collectEvents(
          httpClient.chat({
            context,
            agentId: agent.id,
            conversationId: httpConversation.id,
            message: { content: [{ text: "hello parity" }] },
            modelOverride: "override-parity-model",
          })
        ),
      ]);

      function extractText(events) {
        return events
          .map((event) => event.contentBlockDelta?.delta?.text || "")
          .filter(Boolean)
          .join("");
      }

      assert.equal(extractText(directEvents), "reply via override-parity-model");
      assert.equal(extractText(httpEvents), "reply via override-parity-model");
    } finally {
      await agentsServer.close();
      await svc.deleteConversation(user.id, directConversation.id);
      await svc.deleteConversation(user.id, httpConversation.id);
      await svc.deleteAgent(user.id, agent.id);
    }
  });

  await t.test("Gateway embedding billing matches in direct and HTTP mode", async () => {
    const gatewayServer = await startServer(gatewayApi, "/api");
    const modelName = `mock-embedding-${Date.now()}`;
    const [model] = await db
      .insert(Model)
      .values({
        providerID: 99,
        name: "Mock Embedding Parity",
        internalName: modelName,
        type: "embedding",
        pricing: {
          input_tokens: 0.1,
          images: 0.2,
          video_seconds: 0.3,
          audio_seconds: 0.4,
        },
      })
      .returning();

    const [directUser] = await db
      .insert(User)
      .values({
        email: `gateway-direct-${Date.now()}@test.com`,
        firstName: "Gateway",
        lastName: "Direct",
        status: "active",
        roleID: 3,
        budget: 10,
        remaining: 10,
      })
      .returning();

    const [httpUser] = await db
      .insert(User)
      .values({
        email: `gateway-http-${Date.now()}@test.com`,
        firstName: "Gateway",
        lastName: "Http",
        status: "active",
        roleID: 3,
        budget: 10,
        remaining: 10,
      })
      .returning();

    try {
      const directClient = createGatewayService();
      const httpClient = createGatewayRemote({ baseUrl: gatewayServer.url });

      const input = {
        model: modelName,
        content: ["hello world", { image: "inline-image" }],
        purpose: "GENERIC_INDEX",
        type: "embedding",
      };

      const [directResult, httpResult] = await Promise.all([
        directClient.embed({ userID: directUser.id, ...input }),
        httpClient.embed({ userID: httpUser.id, ...input }),
      ]);

      assert.equal(directResult.embeddings.length, httpResult.embeddings.length);
      assert.deepStrictEqual(
        normalizeEmbeddingUsageItems(directResult.usage),
        normalizeEmbeddingUsageItems(httpResult.usage)
      );

      const directUsage = await db
        .select()
        .from(Usage)
        .where(and(eq(Usage.userID, directUser.id), eq(Usage.modelID, model.id)));
      const httpUsage = await db
        .select()
        .from(Usage)
        .where(and(eq(Usage.userID, httpUser.id), eq(Usage.modelID, model.id)));

      assert.deepStrictEqual(
        directUsage.map(({ unit, quantity, unitCost, cost, type }) => ({
          unit,
          quantity,
          unitCost,
          cost,
          type,
        })),
        httpUsage.map(({ unit, quantity, unitCost, cost, type }) => ({
          unit,
          quantity,
          unitCost,
          cost,
          type,
        }))
      );

      const [directAfter] = await db.select().from(User).where(eq(User.id, directUser.id)).limit(1);
      const [httpAfter] = await db.select().from(User).where(eq(User.id, httpUser.id)).limit(1);
      assert.equal(directAfter.remaining, httpAfter.remaining);
    } finally {
      await gatewayServer.close();
    }
  });

  await t.test("Gateway missing-model errors match in direct and HTTP mode", async () => {
    const gatewayServer = await startServer(gatewayApi, "/api");

    try {
      const directClient = createGatewayService();
      const httpClient = createGatewayRemote({ baseUrl: gatewayServer.url });

      const [directError, httpError] = await Promise.all([
        directClient
          .invoke({
            userID: null,
            model: "missing-model-for-parity",
            messages: [{ role: "user", content: [{ text: "hello" }] }],
            stream: false,
          })
          .then(
            () => null,
            (error) => error
          ),
        httpClient
          .invoke({
            userID: null,
            model: "missing-model-for-parity",
            messages: [{ role: "user", content: [{ text: "hello" }] }],
            stream: false,
          })
          .then(
            () => null,
            (error) => error
          ),
      ]);

      assert.ok(directError, "direct mode should reject");
      assert.ok(httpError, "http mode should reject");
      assert.equal(directError.message, "Model not found");
      assert.equal(httpError.message, "Model not found");
      assert.equal(directError.statusCode, 404);
      assert.equal(httpError.status, 404);
      assert.equal(directError.code, "GATEWAY_MODEL_NOT_FOUND");
      assert.equal(httpError.code, "GATEWAY_MODEL_NOT_FOUND");
    } finally {
      await gatewayServer.close();
    }
  });

  await t.test("Embedding usage normalization covers all supported media counters", async () => {
    assert.deepStrictEqual(
      normalizeEmbeddingUsageItems({
        inputTextTokenCount: 12,
        imageCount: 2,
        videoSeconds: 5,
        audioSeconds: 7,
      }),
      [
        { quantity: 12, unit: "input_tokens" },
        { quantity: 2, unit: "images" },
        { quantity: 5, unit: "video_seconds" },
        { quantity: 7, unit: "audio_seconds" },
      ]
    );
  });

  await t.test("CMS mutation errors match in direct and HTTP mode", async () => {
    const cmsServer = await startServer(cmsApi, "/api/v1");
    const svc = new ConversationService();
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const [otherUser] = await db
      .insert(User)
      .values({
        email: `transport-foreign-${Date.now()}@test.com`,
        firstName: "Transport",
        lastName: "Foreign",
        status: "active",
        roleID: 3,
        budget: 5,
        remaining: 5,
      })
      .returning();
    const foreignConversation = await svc.createConversation(otherUser.id, {
      title: "Transport foreign conversation",
    });
    const foreignMessage = await svc.appendUserMessage(otherUser.id, {
      conversationId: foreignConversation.id,
      content: [{ text: "Foreign message" }],
    });
    const [foreignResource] = await db
      .insert(Resource)
      .values({
        userID: otherUser.id,
        conversationID: foreignConversation.id,
        messageID: foreignMessage.id,
        name: "foreign.txt",
        type: "text/plain",
        content: "Foreign resource",
        metadata: {},
      })
      .returning();

    try {
      const context = createUserRequestContext(user.id, { source: "direct" });
      const directClient = createCmsService({ source: "direct" });
      const httpClient = createCmsRemote({ baseUrl: cmsServer.url });

      async function expectSameError(runDirect, runHttp, expectedMessage, expectedStatus = 404) {
        const [directError, httpError] = await Promise.all([
          runDirect().then(
            () => null,
            (error) => error
          ),
          runHttp().then(
            () => null,
            (error) => error
          ),
        ]);

        assert.ok(directError, "direct mode should reject");
        assert.ok(httpError, "http mode should reject");
        assert.equal(directError.message, expectedMessage);
        assert.equal(httpError.message, expectedMessage);
        assert.equal(httpError.status, expectedStatus);
      }

      await expectSameError(
        () =>
          directClient.appendConversationMessage(context, {
            conversationId: foreignConversation.id,
            role: "user",
            content: [{ text: "Should not persist" }],
          }),
        () =>
          httpClient.appendConversationMessage(context, {
            conversationId: foreignConversation.id,
            role: "user",
            content: [{ text: "Should not persist" }],
          }),
        `Conversation not found: ${foreignConversation.id}`
      );

      await expectSameError(
        () =>
          directClient.storeConversationResource(context, {
            conversationID: foreignConversation.id,
            messageID: foreignMessage.id,
            name: "stolen.txt",
            type: "text/plain",
            content: "Should not persist",
          }),
        () =>
          httpClient.storeConversationResource(context, {
            conversationID: foreignConversation.id,
            messageID: foreignMessage.id,
            name: "stolen.txt",
            type: "text/plain",
            content: "Should not persist",
          }),
        `Message not found: ${foreignMessage.id}`
      );

      await expectSameError(
        () =>
          directClient.storeConversationVectors(context, {
            conversationId: foreignConversation.id,
            vectors: [{ content: "Should not persist" }],
          }),
        () =>
          httpClient.storeConversationVectors(context, {
            conversationId: foreignConversation.id,
            vectors: [{ content: "Should not persist" }],
          }),
        `Conversation not found: ${foreignConversation.id}`
      );

      await expectSameError(
        () =>
          directClient.updateConversationResource(context, foreignResource.id, {
            content: "Should not persist",
          }),
        () =>
          httpClient.updateConversationResource(context, foreignResource.id, {
            content: "Should not persist",
          }),
        `Resource not found: ${foreignResource.id}`
      );

      await expectSameError(
        () => directClient.deleteConversationResource(context, foreignResource.id),
        () => httpClient.deleteConversationResource(context, foreignResource.id),
        `Resource not found: ${foreignResource.id}`
      );
    } finally {
      await cmsServer.close();
    }
  });

  await t.test("CMS agent mutation policy matches in direct and HTTP mode", async () => {
    const cmsServer = await startServer(cmsApi, "/api/v1");
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const [globalAgent] = await db
      .insert(Agent)
      .values({
        userID: null,
        name: `Global parity agent ${Date.now()}`,
      })
      .returning();

    try {
      const context = createUserRequestContext(user.id, { source: "direct" });
      const directClient = createCmsService({ source: "direct" });
      const httpClient = createCmsRemote({ baseUrl: cmsServer.url });

      async function expectSameError(runDirect, runHttp, expectedMessage, expectedStatus) {
        const [directError, httpError] = await Promise.all([
          runDirect().then(
            () => null,
            (error) => error
          ),
          runHttp().then(
            () => null,
            (error) => error
          ),
        ]);

        assert.ok(directError, "direct mode should reject");
        assert.ok(httpError, "http mode should reject");
        assert.equal(directError.message, expectedMessage);
        assert.equal(httpError.message, expectedMessage);
        assert.equal(directError.statusCode, expectedStatus);
        assert.equal(httpError.status, expectedStatus);
      }

      await expectSameError(
        () => directClient.updateAgent(context, globalAgent.id, { name: "Should not persist" }),
        () => httpClient.updateAgent(context, globalAgent.id, { name: "Should not persist" }),
        "Cannot modify global agent",
        403
      );

      await expectSameError(
        () => directClient.deleteAgent(context, globalAgent.id),
        () => httpClient.deleteAgent(context, globalAgent.id),
        "Cannot modify global agent",
        403
      );
    } finally {
      await db.delete(Agent).where(eq(Agent.id, globalAgent.id));
      await cmsServer.close();
    }
  });
});
