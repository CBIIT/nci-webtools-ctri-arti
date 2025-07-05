// Import the shared database instance (which will be SQLite in test mode)
import db, { User, Role, Provider, Model, Usage } from "../services/database.js";
import { seedDatabase } from "../services/schema.js";

export { User, Role, Provider, Model, Usage };

// Initialize test database
export async function setupTestDatabase() {
  await db.sync({ force: true });
  await seedDatabase({ User, Role, Provider, Model, Usage });
}

// Clean up database
export async function teardownTestDatabase() {
  await db.close();
}

// Clear user data between tests
export async function clearTestData() {
  await Usage.destroy({ where: {} });
  await Model.destroy({ where: {} });
  await User.destroy({ where: {} });
}

// Helper to create test user
export async function createTestUser(userData = {}) {
  return await User.create({
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    status: 'active',
    roleId: 3,
    limit: 10.0,
    remaining: 10.0,
    apiKey: 'test-api-key',
    ...userData
  });
}