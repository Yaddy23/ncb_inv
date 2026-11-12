import { test as base } from '@playwright/test';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  getTestModel,
  cleanupTestRecords,
  validateTestDatabaseUri,
  TEST_DB_NAME
} from '../helpers/mongodb';
import { getUserModel } from '../helpers/cleanup';
import { generateTestBook, generateTestCustomer, generateTestMarketingExecutive } from '../helpers/test-data';
import bcrypt from 'bcryptjs';

/**
 * Database fixtures for Playwright tests
 */
interface DatabaseFixtures {
  db: typeof import('mongoose');
  testBook: ReturnType<typeof generateTestBook>;
  testCustomer: ReturnType<typeof generateTestCustomer>;
  testMarketingExecutive: ReturnType<typeof generateTestMarketingExecutive>;
}

/**
 * Extended test with database fixtures
 */
export const dbTest = base.extend<DatabaseFixtures>({
  // Database connection
  db: async ({}, use) => {
    validateTestDatabaseUri();
    const mongoose = await connectTestDatabase();
    await use(mongoose);
    await disconnectTestDatabase();
  },

  // Create a test book before each test
  testBook: async ({ db }, use) => {
    const bookData = generateTestBook();
    const Book = getTestModel('Book');
    const book = await Book.create(bookData);

    // Register for cleanup
    await use(book);

    // Cleanup
    await cleanupTestRecords('Book', book._testId?.split('_')[0] || 'book');
  },

  // Create a test customer before each test
  testCustomer: async ({ db }, use) => {
    const customerData = generateTestCustomer();
    const Customer = getTestModel('Customer');
    const customer = await Customer.create(customerData);

    await use(customer);

    await cleanupTestRecords('Customer', customer._testId?.split('_')[0] || 'customer');
  },

  // Create a test marketing executive before each test
  testMarketingExecutive: async ({ db }, use) => {
    const meData = generateTestMarketingExecutive();
    const MarketingExecutive = getTestModel('MarketingExecutive');
    const me = await MarketingExecutive.create(meData);

    await use(me);

    await cleanupTestRecords('MarketingExecutive', me._testId?.split('_')[0] || 'me');
  },
});

/**
 * Create test user directly in database
 */
export async function createTestUserInDb(
  email: string,
  password: string,
  role: 'Admin' | 'Staff' = 'Staff',
  username?: string
) {
  const User = await getUserModel();
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.findOneAndUpdate(
    { email },
    {
      username: username || email.split('@')[0],
      email,
      password: hashedPassword,
      role,
      isActive: true,
    },
    { upsert: true, new: true }
  );

  return user;
}

/**
 * Create test book directly in database
 */
export async function createTestBookInDb(overrides: Partial<ReturnType<typeof generateTestBook>> = {}) {
  const bookData = generateTestBook(overrides);
  const Book = getTestModel('Book');
  return await Book.create(bookData);
}

/**
 * Create test customer directly in database
 */
export async function createTestCustomerInDb(overrides: Partial<ReturnType<typeof generateTestCustomer>> = {}) {
  const customerData = generateTestCustomer(overrides);
  const Customer = getTestModel('Customer');
  return await Customer.create(customerData);
}

/**
 * Create test marketing executive directly in database
 */
export async function createTestMarketingExecutiveInDb(overrides: Partial<ReturnType<typeof generateTestMarketingExecutive>> = {}) {
  const meData = generateTestMarketingExecutive(overrides);
  const MarketingExecutive = getTestModel('MarketingExecutive');
  return await MarketingExecutive.create(meData);
}

/**
 * Clean up all test data
 */
export async function cleanupAllTestData() {
  const models = ['User', 'Book', 'Customer', 'MarketingExecutive', 'StockTransaction', 'Reservation', 'DeliveryReceipt', 'SalesInvoice', 'EvaluationForm', 'UserLog'];

  for (const modelName of models) {
    try {
      await cleanupTestRecords(modelName, 'test');
      await cleanupTestRecords(modelName, 'user');
      await cleanupTestRecords(modelName, 'book');
      await cleanupTestRecords(modelName, 'customer');
      await cleanupTestRecords(modelName, 'me');
      await cleanupTestRecords(modelName, 'txn');
      await cleanupTestRecords(modelName, 'res');
      await cleanupTestRecords(modelName, 'dr');
      await cleanupTestRecords(modelName, 'si');
      await cleanupTestRecords(modelName, 'ef');
    } catch {
      // Ignore errors for models that don't exist
    }
  }
}

/**
 * Verify test database is properly configured
 */
export async function verifyTestDatabaseConfig() {
  const uri = validateTestDatabaseUri();
  const dbName = uri.split('/').pop()?.split('?')[0];

  return {
    isValid: dbName === TEST_DB_NAME,
    databaseName: dbName,
    expectedName: TEST_DB_NAME,
  };
}

export { expect } from '@playwright/test';