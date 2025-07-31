import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { requireRole } from '../services/middleware.js';

test('requireRole', async (t) => {
  before(async () => {
  });

  after(async () => {
  });

  beforeEach(async () => {
  });

  await t.test('should work correctly', async () => {
    const fn = requireRole('admin');
    assert.strictEqual(typeof fn, 'function');
  });
});