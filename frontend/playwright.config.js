import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load backend .env file
const backendEnvPath = path.resolve(__dirname, '../backend/.env');
dotenv.config({ path: backendEnvPath });

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 30000,
    actionTimeout: 30000,
    headless: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Backend server with test database - reuse existing
      command: 'node ../backend/server.js',
      url: 'http://localhost:8080/health',
      reuseExistingServer: true,
      timeout: 180000,
      env: {
        NODE_ENV: 'test',
        TESTMONGODB_URI: process.env.TESTMONGODB_URI,
      },
    },
    {
      // Frontend preview server with API pointing to test backend - reuse existing
      command: 'cross-env VITE_API_URL=http://localhost:8080/api npm run build && cross-env VITE_API_URL=http://localhost:8080/api npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 180000,
    },
  ],
});