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

describe('Admin Routes', () => {
  let app;
  let adminUser;
  let regularUser;
  let testProvider;
  let testModel;

  beforeAll(async () => {
    await setupTestDatabase();
    
    app = express();
    app.use(express.json());
    app.use(adminRoutes);
  });

  afterAll(async () => {
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

  describe('Security - Admin Access Control', () => {
    test('should require admin role for user management', async () => {
      await request(app)
        .get('/admin/users')
        .set('X-API-KEY', 'user-key')
        .expect(403);
    });

    test('should require authentication for admin routes', async () => {
      await request(app)
        .get('/admin/users')
        .expect(401);
    });

    test('should allow admin access to user management', async () => {
      await request(app)
        .get('/admin/users')
        .set('X-API-KEY', 'admin-key')
        .expect(200);
    });
  });

  describe('GET /admin/users - User Management', () => {
    test('should return paginated user list', async () => {
      const response = await request(app)
        .get('/admin/users?limit=10&offset=0')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toBeDefined();
      expect(response.body.meta.total).toBeGreaterThan(0);
      expect(response.body.meta.limit).toBe(10);
      expect(response.body.meta.offset).toBe(0);
    });

    test('should support user search', async () => {
      const response = await request(app)
        .get('/admin/users?search=Regular')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      const foundUser = response.body.data.find(u => u.firstName === 'Regular');
      expect(foundUser).toBeDefined();
    });

    test('should support email search', async () => {
      const response = await request(app)
        .get('/admin/users?search=user@test.com')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      const foundUser = response.body.data.find(u => u.email === 'user@test.com');
      expect(foundUser).toBeDefined();
    });

    test('should support sorting by different fields', async () => {
      const response = await request(app)
        .get('/admin/users?sortBy=email&sortOrder=ASC')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.meta.sortBy).toBe('email');
      expect(response.body.meta.sortOrder).toBe('ASC');
    });

    test('should prevent SQL injection in search', async () => {
      const maliciousSearch = "'; DROP TABLE users; --";
      const response = await request(app)
        .get(`/admin/users?search=${encodeURIComponent(maliciousSearch)}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      // Should return safely without error
      expect(response.body.data).toBeDefined();
    });
  });

  describe('GET /admin/users/:id', () => {
    test('should return specific user details', async () => {
      const response = await request(app)
        .get(`/admin/users/${regularUser.id}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.id).toBe(regularUser.id);
      expect(response.body.email).toBe('user@test.com');
      expect(response.body.Role).toBeDefined();
    });

    test('should return 404 for non-existent user', async () => {
      await request(app)
        .get('/admin/users/99999')
        .set('X-API-KEY', 'admin-key')
        .expect(404);
    });
  });

  describe('POST /admin/users - User Creation/Update', () => {
    test('should create new user', async () => {
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

      expect(response.body.email).toBe('newuser@test.com');
      expect(response.body.firstName).toBe('New');
    });

    test('should generate API key when requested', async () => {
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

      expect(response.body.apiKey).toBeDefined();
      expect(response.body.apiKey).toMatch(/^rsk_/);
    });

    test('should update existing user', async () => {
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

      expect(response.body.firstName).toBe('Updated');
      expect(response.body.lastName).toBe('Name');
    });
  });

  describe('DELETE /admin/users/:id', () => {
    test('should delete user', async () => {
      await request(app)
        .delete(`/admin/users/${regularUser.id}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      // Verify user is deleted
      const deletedUser = await User.findByPk(regularUser.id);
      expect(deletedUser).toBeNull();
    });

    test('should return 404 for non-existent user', async () => {
      await request(app)
        .delete('/admin/users/99999')
        .set('X-API-KEY', 'admin-key')
        .expect(404);
    });
  });

  describe('GET /admin/users/:id/usage', () => {
    beforeEach(async () => {
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
    });

    test('should return user usage data', async () => {
      const response = await request(app)
        .get(`/admin/users/${regularUser.id}/usage`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.length).toBe(2);
      expect(response.body.meta.user.id).toBe(regularUser.id);
      expect(response.body.meta.total).toBe(2);
    });

    test('should support date range filtering', async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await request(app)
        .get(`/admin/users/${regularUser.id}/usage?startDate=${today}&endDate=${today}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data).toBeDefined();
    });

    test('should return 404 for non-existent user', async () => {
      await request(app)
        .get('/admin/users/99999/usage')
        .set('X-API-KEY', 'admin-key')
        .expect(404);
    });
  });

  describe('GET /admin/roles', () => {
    test('should return all roles', async () => {
      const response = await request(app)
        .get('/admin/roles')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body.find(r => r.name === 'admin')).toBeDefined();
    });
  });

  describe('POST /admin/users/:id/reset-limit', () => {
    test('should reset user usage limit', async () => {
      // Set user's remaining balance to 0
      await regularUser.update({ remaining: 0 });

      const response = await request(app)
        .post(`/admin/users/${regularUser.id}/reset-limit`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.remaining).toBe(regularUser.limit);
    });

    test('should return 404 for non-existent user', async () => {
      await request(app)
        .post('/admin/users/99999/reset-limit')
        .set('X-API-KEY', 'admin-key')
        .expect(404);
    });
  });

  describe('POST /admin/profile - User Profile Update', () => {
    test('should allow authenticated user to update their profile', async () => {
      const updateData = {
        firstName: 'UpdatedFirst',
        lastName: 'UpdatedLast'
      };

      const response = await request(app)
        .post('/admin/profile')
        .set('X-API-KEY', 'user-key')
        .send(updateData)
        .expect(200);

      expect(response.body.firstName).toBe('UpdatedFirst');
      expect(response.body.lastName).toBe('UpdatedLast');
    });

    test('should only allow firstName and lastName updates', async () => {
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

      expect(response.body.firstName).toBe('Updated');
      expect(response.body.email).toBe('user@test.com'); // Should remain unchanged
      expect(response.body.Role.name).toBe('user'); // Should remain unchanged
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/admin/profile')
        .send({ firstName: 'Test' })
        .expect(401);
    });
  });

  describe('GET /admin/usage - System Usage Analytics', () => {
    beforeEach(async () => {
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
    });

    test('should return system-wide usage data', async () => {
      const response = await request(app)
        .get('/admin/usage')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.meta).toBeDefined();
      expect(response.body.data.length).toBe(2);
    });

    test('should support user filtering', async () => {
      const response = await request(app)
        .get(`/admin/usage?userId=${regularUser.id}`)
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].userId).toBe(regularUser.id);
    });
  });

  describe('GET /admin/analytics - Advanced Analytics', () => {
    beforeEach(async () => {
      // Create usage records for analytics
      await Usage.create({
        userId: regularUser.id,
        modelId: testModel.id,
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.25,
        ip: '127.0.0.1'
      });
    });

    test('should return analytics grouped by user', async () => {
      const response = await request(app)
        .get('/admin/analytics?groupBy=user')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.meta.groupBy).toBe('user');
    });

    test('should return analytics grouped by model', async () => {
      const response = await request(app)
        .get('/admin/analytics?groupBy=model')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.meta.groupBy).toBe('model');
    });

    test('should support time-based grouping', async () => {
      const response = await request(app)
        .get('/admin/analytics?groupBy=day')
        .set('X-API-KEY', 'admin-key')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.meta.groupBy).toBe('day');
    });
  });
});