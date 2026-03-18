import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { v1Router } from "cms/api.js";
import { ConversationService } from "cms/core/conversation-service.js";
import db, { User } from "database";
import { eq } from "drizzle-orm";
import express from "express";
import request from "supertest";

function buildApp() {
  const app = express();
  app.use(v1Router);
  return app;
}

describe("CMS API", () => {
  const app = buildApp();
  const svc = new ConversationService();

  it("treats X-User-Id: anonymous as anonymous access for public agents", async () => {
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const privateAgent = await svc.createAgent(user.id, { name: "Private API Agent" });

    try {
      const res = await request(app).get("/agents").set("X-User-Id", "anonymous");

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length >= 1);
      assert.ok(res.body.every((agent) => agent.userID === null));
      assert.equal(
        res.body.some((agent) => agent.id === privateAgent.id),
        false,
        "private agents should be excluded from anonymous agent lists"
      );
    } finally {
      await svc.deleteAgent(user.id, privateAgent.id);
    }
  });

  it("keeps legacy X-User-Id: null compatibility for anonymous access", async () => {
    const res = await request(app).get("/agents").set("X-User-Id", "null");

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.every((agent) => agent.userID === null));
  });

  it("rejects message appends into another user's conversation", async () => {
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const [otherUser] = await db
      .insert(User)
      .values({
        email: `cms-api-foreign-message-${Date.now()}@test.com`,
        firstName: "Foreign",
        lastName: "Message",
        status: "active",
        roleID: 3,
        budget: 5,
        remaining: 5,
      })
      .returning();
    const conversation = await svc.createConversation(otherUser.id, {
      title: "Foreign CMS API conversation",
    });

    const res = await request(app)
      .post(`/conversations/${conversation.id}/messages`)
      .set("X-User-Id", String(user.id))
      .send({ role: "user", content: [{ text: "Should not persist" }] });

    assert.equal(res.status, 404);
    assert.equal(res.body.error, `Conversation not found: ${conversation.id}`);
  });

  it("rejects resource writes against another user's message", async () => {
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const [otherUser] = await db
      .insert(User)
      .values({
        email: `cms-api-foreign-resource-${Date.now()}@test.com`,
        firstName: "Foreign",
        lastName: "Resource",
        status: "active",
        roleID: 3,
        budget: 5,
        remaining: 5,
      })
      .returning();
    const conversation = await svc.createConversation(otherUser.id, {
      title: "Foreign CMS API resource conversation",
    });
    const message = await svc.appendUserMessage(otherUser.id, {
      conversationId: conversation.id,
      content: [{ text: "Foreign message" }],
    });

    const res = await request(app)
      .post("/resources")
      .set("X-User-Id", String(user.id))
      .send({
        conversationID: conversation.id,
        messageID: message.id,
        name: "foreign.txt",
        type: "text/plain",
        content: "Should not persist",
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.error, `Message not found: ${message.id}`);
  });

  it("rejects vector writes into another user's conversation", async () => {
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const [otherUser] = await db
      .insert(User)
      .values({
        email: `cms-api-foreign-vectors-${Date.now()}@test.com`,
        firstName: "Foreign",
        lastName: "Vectors",
        status: "active",
        roleID: 3,
        budget: 5,
        remaining: 5,
      })
      .returning();
    const conversation = await svc.createConversation(otherUser.id, {
      title: "Foreign CMS API vector conversation",
    });

    const res = await request(app)
      .post("/vectors")
      .set("X-User-Id", String(user.id))
      .send({
        conversationID: conversation.id,
        vectors: [{ content: "Should not persist" }],
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.error, `Conversation not found: ${conversation.id}`);
  });
});

