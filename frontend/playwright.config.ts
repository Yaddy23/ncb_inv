import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load backend .env file
const backendEnvPath = path.resolve(__dirname, '../backend/.env');
dotenv.config({ path: backendEnvPath });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 30000,
    actionTimeout: 30000,
    headless: process.env.CI === 'true' || process.env.HEADLESS === 'true',
    // Ignore HTTPS errors for local development
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
    // Tablet viewports
    {
      name: 'Tablet Chrome',
      use: { ...devices['iPad Pro'] },
    },
  ],
  webServer: [
    {
      // Backend server with test database - reuse existing
      command: 'node ../backend/server.js',
      url: 'http://localhost:8080/health',
      reuseExistingServer: !process.env.CI,
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
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
    },
  ],
  // Global setup and teardown
  globalSetup: require.resolve('./tests/helpers/global-setup'),
  globalTeardown: require.resolve('./tests/helpers/global-teardown'),
  // Output directory for test artifacts
  outputDir: 'test-results/',
});