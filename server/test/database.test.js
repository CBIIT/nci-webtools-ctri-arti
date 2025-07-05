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

describe('Database Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  test('should have seed data', async () => {
    const roles = await Role.findAll();
    const models = await Model.findAll();
    
    expect(roles.length).toBeGreaterThan(0);
    expect(models.length).toBeGreaterThan(0);
    expect(roles.find(r => r.name === 'admin')).toBeDefined();
  });

  test('should create and find user', async () => {
    const user = await createTestUser({
      email: 'new@example.com',
      firstName: 'New'
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe('new@example.com');
    expect(user.firstName).toBe('New');

    const foundUser = await User.findOne({ 
      where: { email: 'new@example.com' } 
    });
    expect(foundUser.id).toBe(user.id);
  });

  test('should create usage record', async () => {
    const user = await createTestUser();
    const model = await Model.findOne();

    const usage = await Usage.create({
      userId: user.id,
      modelId: model.id,
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.25
    });

    expect(usage.id).toBeDefined();
    expect(usage.cost).toBe(0.25);
  });

  test('should have working associations', async () => {
    const user = await createTestUser();
    
    const userWithRole = await User.findByPk(user.id, {
      include: [Role]
    });

    expect(userWithRole.Role).toBeDefined();
    expect(userWithRole.Role.name).toBe('user');
  });
});