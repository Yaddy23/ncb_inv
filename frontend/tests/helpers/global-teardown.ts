import { FullConfig } from '@playwright/test';
import { disconnectTestDatabase } from './mongodb';

async function globalTeardown(config: FullConfig) {
  console.log('🛑 Starting global test teardown...');

  // Disconnect from test database
  await disconnectTestDatabase();
  console.log('🔌 Disconnected from test database');

  console.log('✅ Global teardown complete');
}

export default globalTeardown;