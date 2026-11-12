import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load backend .env file
const backendEnvPath = path.resolve(__dirname, '../../../backend/.env');
dotenv.config({ path: backendEnvPath });

const TEST_DB_NAME = 'TESTNCBINVENTORY';

let isConnected = false;

/**
 * Validate that the TESTMONGODB_URI is configured and points to a test database
 */
export function validateTestDatabaseUri(): string {
  const uri = process.env.TESTMONGODB_URI;

  if (!uri) {
    throw new Error('TESTMONGODB_URI not found in environment variables. Please check backend/.env');
  }

  // Verify the database name in the URI is the test database
  if (!uri.includes(TEST_DB_NAME)) {
    throw new Error(
      `TESTMONGODB_URI does not point to the expected test database '${TEST_DB_NAME}'. ` +
      `Current URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`
    );
  }

  return uri;
}

/**
 * Connect to the test database
 */
export async function connectTestDatabase(): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const uri = validateTestDatabaseUri();

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      bufferTimeoutMS: 30000,
      maxPoolSize: 10,
    });

    isConnected = true;
    console.log(`Connected to test database: ${TEST_DB_NAME}`);
    return mongoose;
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw error;
  }
}

/**
 * Disconnect from the test database
 */
export async function disconnectTestDatabase(): Promise<void> {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
    console.log('Disconnected from test database');
  }
}

/**
 * Clear test collections (removes only test-created records)
 */
export async function clearTestCollections(modelNames: string[]): Promise<void> {
  await connectTestDatabase();

  for (const modelName of modelNames) {
    const model = mongoose.models[modelName] || mongoose.model(modelName, new mongoose.Schema({}, { strict: false }));
    // Only delete test records - identified by test email pattern
    await model.deleteMany({
      $or: [
        { email: { $regex: /@test\.com$/ } },
        { username: { $regex: /^test_/ } },
        { ISBN: { $regex: /^TEST-/ } },
      ]
    });
  }

  console.log('Cleared test collections:', modelNames.join(', '));
}

/**
 * Get a model for testing (creates a generic model if not registered)
 */
export function getTestModel(modelName: string) {
  return mongoose.models[modelName] || mongoose.model(modelName, new mongoose.Schema({}, { strict: false }));
}

/**
 * Create a test record with unique identifier
 */
export function createTestRecord<T extends Record<string, any>>(
  baseData: T,
  prefix: string = 'test'
): T & { _testId: string } {
  const testId = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  return {
    ...baseData,
    _testId: testId,
  } as T & { _testId: string };
}

/**
 * Clean up test records by test ID pattern
 */
export async function cleanupTestRecords(
  modelName: string,
  testIdPrefix: string
): Promise<number> {
  await connectTestDatabase();
  const model = getTestModel(modelName);

  const result = await model.deleteMany({ _testId: { $regex: `^${testIdPrefix}_` } });
  console.log(`Cleaned up ${result.deletedCount} test records from ${modelName}`);

  return result.deletedCount;
}

/**
 * Verify database is test database before destructive operations
 */
export async function assertTestDatabase(): Promise<void> {
  const uri = validateTestDatabaseUri();
  const dbName = uri.split('/').pop()?.split('?')[0];

  if (dbName !== TEST_DB_NAME) {
    throw new Error(
      `SAFETY CHECK FAILED: Attempted operation on non-test database '${dbName}'. ` +
      `Expected '${TEST_DB_NAME}'. Aborting to protect production data.`
    );
  }
}

export { TEST_DB_NAME };