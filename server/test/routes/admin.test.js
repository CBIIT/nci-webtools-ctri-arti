import "../../test-support/db.js";
import db, { Usage, User } from "database";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { eq } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { createUsersApplication } from "users/app.js";

import { createAdminRouter } from "../../api/routes/admin.js";

const { TEST_API_KEY } = process.env;
const originalProfiles = new Map();
let mockedSessionUserId = null;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = mockedSessionUserId ? { user: { id: mockedSessionUserId } } : {};
    next();
  });
  app.use(createAdminRouter({ modules: { users: createUsersApplication() } }));
  return app;
}

async function getTestUser() {
  const where = TEST_API_KEY ? eq(User.apiKey, TEST_API_KEY) : eq(User.email, "test@test.com");
  const [user] = await db.select().from(User).where(where).limit(1);
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

  it("sends a usage limit change email when an admin updates a user's budget", async () => {
    const sentEmails = [];
    const appWithEmailSpy = express();
    appWithEmailSpy.use(express.json());
    appWithEmailSpy.use((req, _res, next) => {
      req.session = {};
      next();
    });
    appWithEmailSpy.use(
      createAdminRouter({
        modules: { users: createUsersApplication() },
        now: () => new Date("2026-03-27T14:15:16.000Z"),
        sendUsageLimitChangeEmailImpl: async (data) => {
          sentEmails.push(data);
          return { messageId: "sent" };
        },
      })
    );

    const [user] = await db
      .insert(User)
      .values({
        email: `admin-limit-email-${Date.now()}@test.com`,
        firstName: "Budget",
        lastName: "Notify",
        status: "active",
        roleID: 3,
        budget: 4,
        remaining: 4,
      })
      .returning();

    const res = await request(appWithEmailSpy)
      .post("/admin/users")
      .set("X-API-Key", TEST_API_KEY)
      .send({ id: user.id, budget: 9, remaining: 9 });

    assert.equal(res.status, 200);
    assert.equal(res.body.budget, 9);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].userName, "Budget Notify");
    assert.equal(sentEmails[0].userEmail, user.email);
    assert.equal(sentEmails[0].previousLimit, 4);
    assert.equal(sentEmails[0].newLimit, 9);
    assert.equal(new Date(sentEmails[0].effectiveAt).toISOString(), res.body.updatedAt);
  });
});

describe("usage admin routes", () => {
  const app = buildApp();

  it("preserves exact UTC timestamp bounds for usage and analytics queries", async () => {
    try {
      const [adminUser] = await db
        .insert(User)
        .values({
          email: `admin-route-${Date.now()}@test.com`,
          firstName: "Admin",
          lastName: "Route",
          status: "active",
          roleID: 1,
        })
        .returning();
      mockedSessionUserId = adminUser.id;

      const [user] = await db
        .insert(User)
        .values({
          email: `usage-query-${Date.now()}@test.com`,
          firstName: "Usage",
          lastName: "Query",
          status: "active",
          roleID: 3,
        })
        .returning();
      const usageType = `admin-usage-utc-${Date.now()}`;

      await db.insert(Usage).values([
        {
          userID: user.id,
          requestId: `${usageType}-outside`,
          type: usageType,
          quantity: 1,
          unit: "input_tokens",
          unitCost: 0.01,
          cost: 0.01,
          createdAt: new Date("2026-03-09T08:00:00.000Z"),
          updatedAt: new Date("2026-03-09T08:00:00.000Z"),
        },
        {
          userID: user.id,
          requestId: `${usageType}-inside`,
          type: usageType,
          quantity: 2,
          unit: "input_tokens",
          unitCost: 0.01,
          cost: 0.02,
          createdAt: new Date("2026-03-09T09:00:00.000Z"),
          updatedAt: new Date("2026-03-09T09:00:00.000Z"),
        },
      ]);

      const query =
        `/admin/usage?userId=${user.id}` +
        `&type=${encodeURIComponent(usageType)}` +
        `&startDate=${encodeURIComponent("2026-03-09T08:30:00.000Z")}` +
        `&endDate=${encodeURIComponent("2026-03-09T20:41:57.123Z")}` +
        "&limit=20";

      const usageRes = await request(app).get(query);

      assert.equal(usageRes.status, 200);
      assert.equal(usageRes.body.meta.total, 1);
      assert.equal(usageRes.body.data.length, 1);
      assert.equal(usageRes.body.data[0].requestId, `${usageType}-inside`);
      assert.equal(usageRes.body.data[0].createdAt, "2026-03-09T09:00:00.000Z");

      const analyticsQuery =
        `/admin/analytics?groupBy=user&userId=${user.id}` +
        `&type=${encodeURIComponent(usageType)}` +
        `&startDate=${encodeURIComponent("2026-03-09T08:30:00.000Z")}` +
        `&endDate=${encodeURIComponent("2026-03-09T20:41:57.123Z")}`;

      const analyticsRes = await request(app).get(analyticsQuery);

      assert.equal(analyticsRes.status, 200);
      assert.equal(analyticsRes.body.data.length, 1);
      assert.equal(analyticsRes.body.data[0].totalRequests, 1);
      assert.equal(Number(analyticsRes.body.data[0].totalCost), 0.02);
    } finally {
      mockedSessionUserId = null;
    }
  });

  it("uses tz for date-only usage and analytics queries", async () => {
    try {
      const [adminUser] = await db
        .insert(User)
        .values({
          email: `admin-route-tz-${Date.now()}@test.com`,
          firstName: "Admin",
          lastName: "TZ",
          status: "active",
          roleID: 1,
        })
        .returning();
      mockedSessionUserId = adminUser.id;

      const [user] = await db
        .insert(User)
        .values({
          email: `usage-query-tz-${Date.now()}@test.com`,
          firstName: "Usage",
          lastName: "Timezone",
          status: "active",
          roleID: 3,
        })
        .returning();
      const usageType = `admin-usage-tz-${Date.now()}`;

      await db.insert(Usage).values([
        {
          userID: user.id,
          requestId: `${usageType}-outside`,
          type: usageType,
          quantity: 1,
          unit: "input_tokens",
          unitCost: 0.01,
          cost: 0.01,
          createdAt: new Date("2026-03-09T03:30:00.000Z"),
          updatedAt: new Date("2026-03-09T03:30:00.000Z"),
        },
        {
          userID: user.id,
          requestId: `${usageType}-inside`,
          type: usageType,
          quantity: 2,
          unit: "input_tokens",
          unitCost: 0.01,
          cost: 0.02,
          createdAt: new Date("2026-03-09T04:30:00.000Z"),
          updatedAt: new Date("2026-03-09T04:30:00.000Z"),
        },
      ]);

      const query =
        `/admin/usage?userId=${user.id}` +
        `&type=${encodeURIComponent(usageType)}` +
        "&startDate=2026-03-09&endDate=2026-03-09" +
        `&tz=${encodeURIComponent("America/New_York")}` +
        "&limit=20";

      const usageRes = await request(app).get(query);

      assert.equal(usageRes.status, 200);
      assert.equal(usageRes.body.meta.total, 1);
      assert.equal(usageRes.body.meta.timeZone, "America/New_York");
      assert.equal(usageRes.body.data.length, 1);
      assert.equal(usageRes.body.data[0].requestId, `${usageType}-inside`);

      const analyticsQuery =
        `/admin/analytics?groupBy=day&userId=${user.id}` +
        `&type=${encodeURIComponent(usageType)}` +
        "&startDate=2026-03-09&endDate=2026-03-09" +
        `&tz=${encodeURIComponent("America/New_York")}`;

      const analyticsRes = await request(app).get(analyticsQuery);

      assert.equal(analyticsRes.status, 200);
      assert.equal(analyticsRes.body.meta.timeZone, "America/New_York");
      assert.equal(analyticsRes.body.data.length, 1);
      assert.equal(analyticsRes.body.data[0].period, "2026-03-09T00:00:00");
      assert.equal(analyticsRes.body.data[0].totalRequests, 1);
      assert.equal(Number(analyticsRes.body.data[0].totalCost), 0.02);
    } finally {
      mockedSessionUserId = null;
    }
  });
});
