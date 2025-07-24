import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';
import adminRoutes from '../services/routes/admin.js';
import { 
  setupTestDatabase, 
  teardownTestDatabase, 
  clearTestData,
  createTestUser,
  User,
  Role,
  Model,
  Usage,
  Provider
} from './database.js';

test('Admin Routes', async (t) => {
  let app;
  let adminUser;
  let regularUser;
  let testProvider;
  let testModel;

  before(async () => {
    await setupTestDatabase();
    
    app = express();
    app.use(express.json());
    app.use(adminRoutes);
  });

  after(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    
    // Create test provider
    testProvider = await Provider.findOne({ where: { name: 'test' } });
    if (!testProvider) {
      testProvider = await Provider.create({
        name: 'test',
        label: 'Test Provider'
      });
    }

    // Create test model
    testModel = await Model.create({
      label: 'Test Model',
      value: 'test-model',
      providerId: testProvider.id,
      cost1kInput: 0.01,
      cost1kOutput: 0.02
    });

    // Create admin user
    adminUser = await createTestUser({
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'User',
      roleId: 1, // admin role
      apiKey: 'admin-key',
      limit: 100.0,
      remaining: 50.0
    });

    // Create regular user
    regularUser = await createTestUser({
      email: 'user@test.com',
      firstName: 'Regular',
      lastName: 'User',
      roleId: 3, // user role
      apiKey: 'user-key',
      limit: 10.0,
      remaining: 5.0
    });
  });

  await t.test('Security - Admin Access Control', async (subT) => {
    await subT.test('should require admin role for user management', async () => {
      await request(app)
        .get('/admin/users')
        .set('X-API-KEY', 'user-key')
        .expect(403);
    });

    await subT.test('should require authentication for admin routes', async () => {
      await request(app)
        .get('/admin/users')
        .expect(401);
    });

    await subT.test('should allow admin access to user management', async () => {
      await request(app)
        .get('/admin/users')
        .set('X-API-KEY', 'admin-key')
        .expect(200);
    });
  });

  await t.test('GET /admin/users - User Management', async (subT) => {
    await subT.test('should return paginated user list', async () => {
      const response = await request(app)
        .get('/admin/users?limit=10&offset=0')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data);
      assert.ok(Array.isArray(response.body.data));
      assert.ok(response.body.meta);
      assert.ok(response.body.meta.total > 0);
      assert.strictEqual(response.body.meta.limit, 10);
      assert.strictEqual(response.body.meta.offset, 0);
    });

    await subT.test('should support user search', async () => {
      const response = await request(app)
        .get('/admin/users?search=Regular')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data.length > 0);
      const foundUser = response.body.data.find(u => u.firstName === 'Regular');
      assert.ok(foundUser);
    });

    await subT.test('should support email search', async () => {
      const response = await request(app)
        .get('/admin/users?search=user@test.com')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data.length > 0);
      const foundUser = response.body.data.find(u => u.email === 'user@test.com');
      assert.ok(foundUser);
    });

    await subT.test('should support sorting by different fields', async () => {
      const response = await request(app)
        .get('/admin/users?sortBy=email&sortOrder=ASC')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.strictEqual(response.body.meta.sortBy, 'email');
      assert.strictEqual(response.body.meta.sortOrder, 'ASC');
    });

    await subT.test('should prevent SQL injection in search', async () => {
      const maliciousSearch = "'; DROP TABLE users; --";
      const response = await request(app)
        .get(`/admin/users?search=${encodeURIComponent(maliciousSearch)}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      // Should return safely without error
      assert.ok(response.body.data);
    });
  });

  await t.test('GET /admin/users/:id', async (subT) => {
    await subT.test('should return specific user details', async () => {
      const response = await request(app)
        .get(`/admin/users/${regularUser.id}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.strictEqual(response.body.id, regularUser.id);
      assert.strictEqual(response.body.email, 'user@test.com');
      assert.ok(response.body.Role);
    });

    await subT.test('should return 404 for non-existent user', async () => {
      await request(app)
        .get('/admin/users/99999')
        .set('X-API-KEY', 'admin-key')
        .expect(404);
    });
  });

  await t.test('POST /admin/users - User Creation/Update', async (subT) => {
    await subT.test('should create new user', async () => {
      const newUserData = {
        email: 'newuser@test.com',
        firstName: 'New',
        lastName: 'User',
        roleId: 3,
        limit: 5.0,
        remaining: 5.0
      };

      const response = await request(app)
        .post('/admin/users')
        .set('X-API-KEY', 'admin-key')
        .send(newUserData)
        .expect(200);

      assert.strictEqual(response.body.email, 'newuser@test.com');
      assert.strictEqual(response.body.firstName, 'New');
    });

    await subT.test('should generate API key when requested', async () => {
      const newUserData = {
        email: 'apikeyuser@test.com',
        firstName: 'API',
        lastName: 'User',
        roleId: 3,
        generateApiKey: true
      };

      const response = await request(app)
        .post('/admin/users')
        .set('X-API-KEY', 'admin-key')
        .send(newUserData)
        .expect(200);

      assert.ok(response.body.apiKey);
      assert.ok(response.body.apiKey.startsWith('rsk_'));
    });

    await subT.test('should update existing user', async () => {
      const updateData = {
        id: regularUser.id,
        firstName: 'Updated',
        lastName: 'Name'
      };

      const response = await request(app)
        .post('/admin/users')
        .set('X-API-KEY', 'admin-key')
        .send(updateData)
        .expect(200);

      assert.strictEqual(response.body.firstName, 'Updated');
      assert.strictEqual(response.body.lastName, 'Name');
    });
  });

  await t.test('DELETE /admin/users/:id', async (subT) => {
    await subT.test('should delete user', async () => {
      await request(app)
        .delete(`/admin/users/${regularUser.id}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      // Verify user is deleted
      const deletedUser = await User.findByPk(regularUser.id);
      assert.strictEqual(deletedUser, null);
    });

    await subT.test('should return 404 for non-existent user', async () => {
      await request(app)
        .delete('/admin/users/99999')
        .set('X-API-KEY', 'admin-key')
        .expect(404);
    });
  });

  await t.test('GET /admin/users/:id/usage', async (subT) => {
    await subT.test('should return user usage data', async () => {
      // Create some usage records
      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.25,
        ip: '127.0.0.1'
      });

      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.50,
        ip: '127.0.0.1'
      });

      const response = await request(app)
        .get(`/admin/users/${regularUser.id}/usage`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data);
      assert.strictEqual(response.body.data.length, 2);
      assert.strictEqual(response.body.meta.user.id, regularUser.id);
      assert.strictEqual(response.body.meta.total, 2);
    });

    await subT.test('should support date range filtering', async () => {
      // Create some usage records
      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.25,
        ip: '127.0.0.1'
      });

      const today = new Date().toISOString().split('T')[0];
      const response = await request(app)
        .get(`/admin/users/${regularUser.id}/usage?startDate=${today}&endDate=${today}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data);
    });

    await subT.test('should return 404 for non-existent user', async () => {
      await request(app)
        .get('/admin/users/99999/usage')
        .set('X-API-KEY', 'admin-key')
        .expect(404);
    });
  });

  await t.test('GET /admin/roles', async (subT) => {
    await subT.test('should return all roles', async () => {
      const response = await request(app)
        .get('/admin/roles')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(Array.isArray(response.body));
      assert.ok(response.body.length > 0);
      assert.ok(response.body.find(r => r.name === 'admin'));
    });
  });

  await t.test('POST /admin/users/:id/reset-limit', async (subT) => {
    await subT.test('should reset user usage limit', async () => {
      // Set user's remaining balance to 0
      await regularUser.update({ remaining: 0 });

      const response = await request(app)
        .post(`/admin/users/${regularUser.id}/reset-limit`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.strictEqual(response.body.success, true);
      assert.strictEqual(response.body.user.remaining, regularUser.limit);
    });

    await subT.test('should return 404 for non-existent user', async () => {
      await request(app)
        .post('/admin/users/99999/reset-limit')
        .set('X-API-KEY', 'admin-key')
        .expect(404);
    });
  });

  await t.test('POST /admin/profile - User Profile Update', async (subT) => {
    await subT.test('should allow authenticated user to update their profile', async () => {
      const updateData = {
        firstName: 'UpdatedFirst',
        lastName: 'UpdatedLast'
      };

      const response = await request(app)
        .post('/admin/profile')
        .set('X-API-KEY', 'user-key')
        .send(updateData)
        .expect(200);

      assert.strictEqual(response.body.firstName, 'UpdatedFirst');
      assert.strictEqual(response.body.lastName, 'UpdatedLast');
    });

    await subT.test('should only allow firstName and lastName updates', async () => {
      const updateData = {
        firstName: 'Updated',
        email: 'hacker@evil.com', // Should be ignored
        roleId: 1 // Should be ignored
      };

      const response = await request(app)
        .post('/admin/profile')
        .set('X-API-KEY', 'user-key')
        .send(updateData)
        .expect(200);

      assert.strictEqual(response.body.firstName, 'Updated');
      assert.strictEqual(response.body.email, 'user@test.com'); // Should remain unchanged
      assert.strictEqual(response.body.Role.name, 'user'); // Should remain unchanged
    });

    await subT.test('should require authentication', async () => {
      await request(app)
        .post('/admin/profile')
        .send({ firstName: 'Test' })
        .expect(401);
    });
  });

  await t.test('GET /admin/usage - System Usage Analytics', async (subT) => {
    await subT.test('should return system-wide usage data', async () => {
      // Create usage records for analytics
      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.25,
        ip: '127.0.0.1'
      });

      await Usage.create({
        userId: adminUser.id,
        modelId: testModel.id,
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.50,
        ip: '127.0.0.1'
      });

      const response = await request(app)
        .get('/admin/usage')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data);
      assert.ok(response.body.meta);
      assert.strictEqual(response.body.data.length, 2);
    });

    await subT.test('should support user filtering', async () => {
      // Create usage records for analytics
      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.25,
        ip: '127.0.0.1'
      });

      await Usage.create({
        userId: adminUser.id,
        modelId: testModel.id,
        inputTokens: 200,
        outputTokens: 100,
        cost: 0.50,
        ip: '127.0.0.1'
      });

      const response = await request(app)
        .get(`/admin/usage?userId=${regularUser.id}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.strictEqual(response.body.data.length, 1);
      assert.strictEqual(response.body.data[0].userId, regularUser.id);
    });
  });

  await t.test('GET /admin/analytics - Advanced Analytics', async (subT) => {
    await subT.test('should return analytics grouped by user', async () => {
      // Create usage records for analytics
      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.25,
        ip: '127.0.0.1'
      });

      const response = await request(app)
        .get('/admin/analytics?groupBy=user')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data);
      assert.strictEqual(response.body.meta.groupBy, 'user');
    });

    await subT.test('should return analytics grouped by model', async () => {
      // Create usage records for analytics
      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.25,
        ip: '127.0.0.1'
      });

      const response = await request(app)
        .get('/admin/analytics?groupBy=model')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data);
      assert.strictEqual(response.body.meta.groupBy, 'model');
    });

    await subT.test('should support time-based grouping', async () => {
      // Create usage records for analytics
      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.25,
        ip: '127.0.0.1'
      });

      const response = await request(app)
        .get('/admin/analytics?groupBy=day')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      assert.ok(response.body.data);
      assert.strictEqual(response.body.meta.groupBy, 'day');
    });
  });
});