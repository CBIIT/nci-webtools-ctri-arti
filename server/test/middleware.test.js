import express from 'express';
import request from 'supertest';
import { 
  requireRole, 
  getAuthorizedUrl,
  getAuthorizedHeaders
} from '../services/middleware.js';
import { 
  setupTestDatabase, 
  teardownTestDatabase, 
  clearTestData,
  createTestUser
} from './database.js';

describe('Middleware Functions', () => {
  let app;

  beforeAll(async () => {
    await setupTestDatabase();
    
    // Simple test app
    app = express();
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
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  describe('requireRole middleware', () => {
    test('should authenticate with valid API key', async () => {
      const user = await createTestUser({ 
        email: 'api@test.com',
        apiKey: 'test-key' 
      });

      const response = await request(app)
        .get('/protected')
        .set('X-API-KEY', 'test-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.email).toBe('api@test.com');
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

    test('should enforce admin role requirements', async () => {
      const regularUser = await createTestUser({ 
        roleId: 3, // user role
        apiKey: 'user-key' 
      });
      
      const adminUser = await createTestUser({ 
        roleId: 1, // admin role  
        apiKey: 'admin-key',
        email: 'admin@test.com'
      });

      // Regular user should be rejected
      await request(app)
        .get('/admin-only')
        .set('X-API-KEY', 'user-key')
        .expect(403);

      // Admin user should be allowed
      await request(app)
        .get('/admin-only')
        .set('X-API-KEY', 'admin-key')
        .expect(200);
    });
  });

  describe('utility functions', () => {
    describe('getAuthorizedUrl', () => {
      test('should add API key for govinfo.gov', () => {
        const url = new URL('https://api.govinfo.gov/collections');
        const env = { DATA_GOV_API_KEY: 'test-key' };
        
        const result = getAuthorizedUrl(url, env);
        
        expect(result).toContain('api_key=test-key');
      });

      test('should add API key for congress.gov', () => {
        const url = new URL('https://api.congress.gov/v3/bill');
        const env = { CONGRESS_GOV_API_KEY: 'congress-key' };
        
        const result = getAuthorizedUrl(url, env);
        
        expect(result).toContain('api_key=congress-key');
      });

      test('should not modify other URLs', () => {
        const url = new URL('https://example.com/test');
        const env = { DATA_GOV_API_KEY: 'test-key' };
        
        const result = getAuthorizedUrl(url, env);
        
        expect(result).toBe('https://example.com/test');
      });
    });

    describe('getAuthorizedHeaders', () => {
      test('should add subscription token for Brave Search', () => {
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        const env = { BRAVE_SEARCH_API_KEY: 'brave-key' };
        
        const result = getAuthorizedHeaders(url, env);
        
        expect(result).toEqual({ 'x-subscription-token': 'brave-key' });
      });

      test('should return empty object for other URLs', () => {
        const url = new URL('https://example.com/test');
        const env = { BRAVE_SEARCH_API_KEY: 'brave-key' };
        
        const result = getAuthorizedHeaders(url, env);
        
        expect(result).toEqual({});
      });
    });
  });
});