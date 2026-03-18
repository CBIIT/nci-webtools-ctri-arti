import db, { User } from "database";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { eq } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { createUsersApplication } from "users/app.js";

import { createAdminRouter } from "../../api/routes/admin.js";

const { TEST_API_KEY } = process.env;
const originalProfiles = new Map();

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {};
    next();
  });
  app.use(createAdminRouter({ modules: { users: createUsersApplication() } }));
  return app;
}

async function getTestUser() {
  const [user] = await db.select().from(User).where(eq(User.email, "test@test.com")).limit(1);
  assert.ok(user, "test admin user should exist");
  return user;
}

describe("POST /admin/profile", () => {
  const app = buildApp();

  after(async () => {
    for (const [id, profile] of originalProfiles) {
      await db
        .update(User)
        .set({ firstName: profile.firstName, lastName: profile.lastName })
        .where(eq(User.id, id));
    }
  });

  it("updates the authenticated user's profile through the normal auth path", async () => {
    const user = await getTestUser();
    if (!originalProfiles.has(user.id)) {
      originalProfiles.set(user.id, {
        firstName: user.firstName,
        lastName: user.lastName,
      });
    }

    const nextFirstName = `${user.firstName}-profile`;

    const res = await request(app)
      .post("/admin/profile")
      .set("X-API-Key", TEST_API_KEY)
      .send({ firstName: nextFirstName, lastName: user.lastName });

    assert.equal(res.status, 200);
    assert.equal(res.body.id, user.id);
    assert.equal(res.body.firstName, nextFirstName);
    assert.equal(res.body.lastName, user.lastName);

    const [updated] = await db.select().from(User).where(eq(User.id, user.id)).limit(1);
    assert.equal(updated.firstName, nextFirstName);
  });

  it("rejects unauthenticated profile updates", async () => {
    const res = await request(app).post("/admin/profile").send({ firstName: "Nope" });
    assert.equal(res.status, 401);
  });
});

describe("budget admin routes", () => {
  const app = buildApp();

  it("returns the normalized single-user budget reset response", async () => {
    const [user] = await db
      .insert(User)
      .values({
        email: `admin-reset-user-${Date.now()}@test.com`,
        firstName: "Budget",
        lastName: "Single",
        status: "active",
        roleID: 3,
        budget: 9,
        remaining: 2,
      })
      .returning();

    const res = await request(app)
      .post(`/admin/users/${user.id}/reset-limit`)
      .set("X-API-Key", TEST_API_KEY);

    assert.equal(res.status, 200);
    assert.deepStrictEqual(Object.keys(res.body).sort(), ["success", "user"]);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.id, user.id);
    assert.equal(res.body.user.remaining, res.body.user.budget);
  });

  it("returns the normalized bulk budget reset response", async () => {
    const [user] = await db
      .insert(User)
      .values({
        email: `admin-reset-all-${Date.now()}@test.com`,
        firstName: "Budget",
        lastName: "Bulk",
        status: "active",
        roleID: 3,
        budget: 6,
        remaining: 1,
      })
      .returning();

    const res = await request(app).post("/admin/usage/reset").set("X-API-Key", TEST_API_KEY);

    assert.equal(res.status, 200);
    assert.deepStrictEqual(Object.keys(res.body).sort(), ["success", "updatedUsers"]);
    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.updatedUsers, "number");
    assert.ok(res.body.updatedUsers >= 1);

    const [updated] = await db.select().from(User).where(eq(User.id, user.id)).limit(1);
    assert.equal(updated.remaining, updated.budget);
  });
});


