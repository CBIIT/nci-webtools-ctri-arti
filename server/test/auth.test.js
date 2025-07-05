import express from 'express';
import request from 'supertest';
import { requireRole } from '../services/middleware.js';
import { 
  setupTestDatabase, 
  teardownTestDatabase, 
  clearTestData,
  createTestUser
} from './database.js';

// Simple test app
const app = express();
app.use(express.json());

// Test routes
app.get('/protected', requireRole(), (req, res) => {
  res.json({ 
    success: true,
    userId: req.session.user.id,
    email: req.session.user.email
  });
});

app.get('/admin-only', requireRole('admin'), (req, res) => {
  res.json({ 
    success: true,
    userId: req.session.user.id
  });
});

describe('API Key Authentication', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  test('should authenticate with valid API key', async () => {
    const user = await createTestUser({
      email: 'apitest@example.com'
    });

    const response = await request(app)
      .get('/protected')
      .set('X-API-KEY', 'test-api-key')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.email).toBe('apitest@example.com');
  });

  test('should reject invalid API key', async () => {
    await request(app)
      .get('/protected')
      .set('X-API-KEY', 'invalid-key')
      .expect(401);
  });

  test('should reject missing authentication', async () => {
    await request(app)
      .get('/protected')
      .expect(401);
  });

  test('should enforce role requirements', async () => {
    const regularUser = await createTestUser({
      email: 'regular@example.com',
      roleId: 3 // user role
    });

    const adminUser = await createTestUser({
      email: 'admin@example.com',
      roleId: 1, // admin role
      apiKey: 'admin-key'
    });

    // Regular user should be rejected
    await request(app)
      .get('/admin-only')
      .set('X-API-KEY', 'test-api-key')
      .expect(403);

    // Admin user should be allowed
    await request(app)
      .get('/admin-only')
      .set('X-API-KEY', 'admin-key')
      .expect(200);
  });
});