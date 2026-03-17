import assert from "node:assert/strict";
import { describe, it } from "node:test";

import db, { Resource, User } from "database";
import { ConversationService } from "cms/conversation.js";
import { eq } from "drizzle-orm";
import express from "express";
import request from "supertest";

import api from "../../services/routes/conversations.js";

const svc = new ConversationService();

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.session = {};
    next();
  });
  app.use(api);
  return app;
}

describe("GET /resources/:id/download", () => {
  const app = buildApp();

  it("downloads the stored resource representation", async () => {
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const [resource] = await db
      .insert(Resource)
      .values({
        userID: user.id,
        name: "audit.txt",
        type: "text/plain",
        content: "auditable recall content",
        metadata: { format: "txt", encoding: "utf-8" },
      })
      .returning();

    const res = await request(app)
      .get(`/resources/${resource.id}/download`)
      .set("X-API-Key", process.env.TEST_API_KEY);

    assert.equal(res.status, 200);
    assert.match(res.headers["content-disposition"], /attachment; filename="audit.txt"/);
    assert.match(res.headers["content-type"], /^text\/plain/);
    assert.equal(res.text, "auditable recall content");

    await db.delete(Resource).where(eq(Resource.id, resource.id));
  });

  it("returns 401 instead of throwing when the request is unauthenticated", async () => {
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const [resource] = await db
      .insert(Resource)
      .values({
        userID: user.id,
        name: "audit.txt",
        type: "text/plain",
        content: "auditable recall content",
        metadata: { format: "txt", encoding: "utf-8" },
      })
      .returning();

    const res = await request(app).get(`/resources/${resource.id}/download`);

    assert.equal(res.status, 401);

    await db.delete(Resource).where(eq(Resource.id, resource.id));
  });
});

describe("GET /resources/:id", () => {
  const app = buildApp();

  it("returns the stored resource JSON", async () => {
    const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
    assert.ok(user, "test user should exist");

    const [resource] = await db
      .insert(Resource)
      .values({
        userID: user.id,
        name: "audit.json",
        type: "application/json",
        content: '{"audit":true}',
        metadata: { format: "json", encoding: "utf-8" },
      })
      .returning();

    const res = await request(app)
      .get(`/resources/${resource.id}`)
      .set("X-API-Key", process.env.TEST_API_KEY);

    assert.equal(res.status, 200);
    assert.equal(res.body.id, resource.id);
    assert.equal(res.body.name, "audit.json");

    await db.delete(Resource).where(eq(Resource.id, resource.id));
  });
});
