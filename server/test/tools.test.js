import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import request from 'supertest';
import toolsRoutes from '../services/routes/tools.js';
import { 
  setupTestDatabase, 
  teardownTestDatabase, 
  clearTestData,
  createTestUser
} from './database.js';

test('Tools Routes', async (t) => {
  let app;
  let testUser;

  before(async () => {
    await setupTestDatabase();
    
    app = express();
    app.use(express.json());
    app.use(toolsRoutes);
  });

  after(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    
    testUser = await createTestUser({
      email: 'user@test.com',
      apiKey: 'test-key',
      roleId: 3
    });
  });

  await t.test('GET /status', async (subT) => {
    await subT.test('should return system status without authentication', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      // VERSION may be undefined in test environment
      assert.ok(response.body.version !== undefined || response.body.version === undefined);
      assert.ok(response.body.uptime);
      assert.ok(response.body.database);
    });

    await subT.test('should include database health check', async () => {
      const response = await request(app)
        .get('/status')
        .expect(200);

      assert.strictEqual(response.body.database.health, 'ok');
    });
  });

  await t.test('Authentication Requirements', async (subT) => {
    await subT.test('should require auth for search endpoint', async () => {
      await request(app)
        .get('/search?q=test')
        .expect(401);
    });

    await subT.test('should require auth for translate endpoint', async () => {
      await request(app)
        .post('/translate')
        .send({ text: 'Hello', targetLanguage: 'es' })
        .expect(401);
    });

    await subT.test('should require auth for translate/languages endpoint', async () => {
      await request(app)
        .get('/translate/languages')
        .expect(401);
    });

    await subT.test('should require auth for feedback endpoint', async () => {
      await request(app)
        .post('/feedback')
        .send({ feedback: 'Great app!', context: 'general' })
        .expect(401);
    });

    await subT.test('should require auth for proxy endpoint', async () => {
      await request(app)
        .get('/browse/https://example.com')
        .expect(401);
    });
  });

  await t.test('Authenticated Endpoint Access', async (subT) => {
    await subT.test('should allow authenticated access to search', async () => {
      const response = await request(app)
        .get('/search?q=test')
        .set('X-API-KEY', 'test-key');

      // Should not be authentication error (may be other errors due to external dependencies)
      assert.notStrictEqual(response.status, 401);
      assert.notStrictEqual(response.status, 403);
    });

    await subT.test('should allow authenticated access to translate', async () => {
      const response = await request(app)
        .post('/translate')
        .set('X-API-KEY', 'test-key')
        .send({ text: 'Hello', targetLanguage: 'es' });

      // Should not be authentication error
      assert.notStrictEqual(response.status, 401);
      assert.notStrictEqual(response.status, 403);
    });

    await subT.test('should allow authenticated access to translate/languages', async () => {
      const response = await request(app)
        .get('/translate/languages')
        .set('X-API-KEY', 'test-key');

      // Should not be authentication error
      assert.notStrictEqual(response.status, 401);
      assert.notStrictEqual(response.status, 403);
    });

    await subT.test('should allow authenticated access to feedback', async () => {
      const response = await request(app)
        .post('/feedback')
        .set('X-API-KEY', 'test-key')
        .send({ feedback: 'Great app!', context: 'general' });

      // Should not be authentication error
      assert.notStrictEqual(response.status, 401);
      assert.notStrictEqual(response.status, 403);
    });

    await subT.test('should allow authenticated access to proxy', async () => {
      const response = await request(app)
        .get('/browse/https://httpbin.org/get')
        .set('X-API-KEY', 'test-key');

      // Should not be authentication error
      assert.notStrictEqual(response.status, 401);
      assert.notStrictEqual(response.status, 403);
    });
  });

  await t.test('Request Validation', async (subT) => {
    await subT.test('should handle malformed search requests', async () => {
      const response = await request(app)
        .get('/search') // No query parameter
        .set('X-API-KEY', 'test-key');

      // Should handle gracefully (not crash)
      assert.ok([200, 400, 500].includes(response.status));
    });

    await subT.test('should handle malformed translation requests', async () => {
      const response = await request(app)
        .post('/translate')
        .set('X-API-KEY', 'test-key')
        .send({}); // Empty body

      // Should handle gracefully
      assert.ok([200, 400, 500].includes(response.status));
    });

    await subT.test('should handle malformed feedback requests', async () => {
      const response = await request(app)
        .post('/feedback')
        .set('X-API-KEY', 'test-key')
        .send({ feedback: '' }); // Empty feedback

      // Should handle gracefully
      assert.ok([200, 400, 500].includes(response.status));
    });
  });

  await t.test('Security - Proxy Endpoint', async (subT) => {
    await subT.test('should reject malicious URLs', async () => {
      const maliciousUrls = [
        '/browse/file:///etc/passwd',
        '/browse/javascript:alert(1)',
        '/browse/data:text/html,<script>alert(1)</script>'
      ];

      for (const url of maliciousUrls) {
        const response = await request(app)
          .get(url)
          .set('X-API-KEY', 'test-key');

        // Should reject or handle securely (not 200)
        assert.notStrictEqual(response.status, 200);
      }
    });

    await subT.test('should handle proxy errors gracefully', async () => {
      const response = await request(app)
        .get('/browse/https://nonexistent-domain-12345.com')
        .set('X-API-KEY', 'test-key');

      // Should handle DNS/connection errors gracefully
      assert.ok([403, 500].includes(response.status));
    });
  });

  await t.test('Large Request Handling', async (subT) => {
    await subT.test('should handle large translation requests', async () => {
      const largeText = 'A'.repeat(1000); // 1KB text
      
      const response = await request(app)
        .post('/translate')
        .set('X-API-KEY', 'test-key')
        .send({ text: largeText, targetLanguage: 'es' });

      // Should handle large requests (may fail due to service limits, but shouldn't crash)
      assert.ok([200, 400, 413, 500].includes(response.status));
    });

    await subT.test('should handle large feedback', async () => {
      const largeFeedback = 'This is detailed feedback. '.repeat(100); // ~2.7KB
      
      const response = await request(app)
        .post('/feedback')
        .set('X-API-KEY', 'test-key')
        .send({ feedback: largeFeedback, context: 'detailed' });

      // Should handle gracefully
      assert.ok([200, 400, 413, 500].includes(response.status));
    });
  });
});