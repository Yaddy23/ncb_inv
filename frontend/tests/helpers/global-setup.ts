import { FullConfig } from '@playwright/test';
import { connectTestDatabase, disconnectTestDatabase, clearTestCollections } from './mongodb';
import { setupTestDatabase } from './cleanup';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global test setup...');

  // Connect to test database
  await connectTestDatabase();
  console.log('✅ Connected to test database');

  // Clear any existing test data (excluding User - setupTestDatabase handles User cleanup)
  await clearTestCollections(['Book', 'DeliveryReceipt', 'SalesInvoice', 'Reservation', 'EvaluationForm', 'Module', 'Role']);
  console.log('🧹 Cleared existing test data');

  // Create test users (this also cleans up existing test users)
  await setupTestDatabase();
  console.log('👥 Test users created');

  // Store database connection info for tests
  process.env.TEST_DB_READY = 'true';

  console.log('✅ Global setup complete');
}

export default globalSetup;