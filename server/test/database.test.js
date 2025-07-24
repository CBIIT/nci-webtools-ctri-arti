import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  setupTestDatabase, 
  teardownTestDatabase, 
  clearTestData,
  createTestUser,
  User,
  Role,
  Model,
  Usage
} from './database.js';

test('Database Tests', async (t) => {
  before(async () => {
    await setupTestDatabase();
  });

  after(async () => {
    await teardownTestDatabase();
  });

  await t.test('should have seed data', async () => {
    const roles = await Role.findAll();
    const models = await Model.findAll();
    
    assert.ok(roles.length > 0);
    assert.ok(models.length > 0);
    assert.ok(roles.find(r => r.name === 'admin'));
  });

  afterEach(async () => {
    await clearTestData();
  });

  await t.test('should create and find user', async () => {
    const user = await createTestUser({
      email: 'new@example.com',
      firstName: 'New'
    });

    assert.ok(user.id);
    assert.strictEqual(user.email, 'new@example.com');
    assert.strictEqual(user.firstName, 'New');

    const foundUser = await User.findOne({ 
      where: { email: 'new@example.com' } 
    });
    assert.strictEqual(foundUser.id, user.id);
  });

  await t.test('should create usage record', async () => {
    const user = await createTestUser();
    
    // Create a test model since clearTestData removes them
    const model = await Model.create({
      label: 'Test Model',
      value: 'test-model',
      providerId: 1,
      cost1kInput: 0.01,
      cost1kOutput: 0.02
    });

    const usage = await Usage.create({
      userId: user.id,
      modelId: model.id,
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.25
    });

    assert.ok(usage.id);
    assert.strictEqual(usage.cost, 0.25);
  });

  await t.test('should have working associations', async () => {
    const user = await createTestUser();
    
    const userWithRole = await User.findByPk(user.id, {
      include: [Role]
    });

    assert.ok(userWithRole.Role);
    assert.strictEqual(userWithRole.Role.name, 'user');
  });
});