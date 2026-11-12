import { test as base, Page, BrowserContext } from '@playwright/test';
import { setupTestDatabase, teardownTestDatabase, runCleanup } from '../helpers/cleanup';
import { connectTestDatabase, disconnectTestDatabase, validateTestDatabaseUri } from '../helpers/mongodb';

/**
 * Test user credentials
 */
export const TEST_USERS = {
  admin: {
    email: 'admin@test.com',
    password: 'Admin1234',
    role: 'Admin' as const,
  },
  staff: {
    email: 'staff@test.com',
    password: 'Staff1234',
    role: 'Staff' as const,
  },
};

/**
 * Authenticated page fixture
 */
interface AuthFixtures {
  adminPage: Page;
  staffPage: Page;
  adminContext: BrowserContext;
  staffContext: BrowserContext;
}

/**
 * Create authenticated page fixture
 */
async function createAuthenticatedPage(
  context: BrowserContext,
  user: typeof TEST_USERS.admin
): Promise<Page> {
  const page = await context.newPage();

  // Capture failed requests
  const failedRequests: Array<{ url: string; status: number; body: string }> = [];
  page.on('response', async response => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        body = 'Could not read response body';
      }
      failedRequests.push({ url: response.url(), status: response.status(), body });
      console.log(`FAILED REQUEST: ${response.status()} ${response.url()}`, body);
    }
  });

  // Navigate to login
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('input[name="email"]', { timeout: 15000 });

  // Clear storage
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await context.clearCookies();

  // Login
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect based on role
  if (user.role === 'Admin') {
    await page.waitForURL(/\/admin/, { timeout: 20000 });
  } else {
    await page.waitForURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });
  }

  if (failedRequests.length > 0) {
    console.log('Failed requests during login:', JSON.stringify(failedRequests, null, 2));
  }

  return page;
}

/**
 * Extended test with auth fixtures
 */
export const test = base.extend<AuthFixtures>({
  // Global setup - runs once before all tests
  // eslint-disable-next-line no-empty-pattern
  adminPage: async ({ browser }, use) => {
    // Validate test database
    validateTestDatabaseUri();
    await setupTestDatabase();

    const context = await browser.newContext({
      baseURL: 'http://localhost:4173',
    });

    const page = await createAuthenticatedPage(context, TEST_USERS.admin);

    await use(page);

    await page.close();
    await context.close();
  },

  adminContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: 'http://localhost:4173',
    });

    await use(context);

    await context.close();
  },

  staffPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: 'http://localhost:4173',
    });

    const page = await createAuthenticatedPage(context, TEST_USERS.staff);

    await use(page);

    await page.close();
    await context.close();
  },

  staffContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: 'http://localhost:4173',
    });

    await use(context);

    await context.close();
  },
});

/**
 * Test info for reporting
 */
export { expect } from '@playwright/test';

/**
 * Global teardown - runs after all tests
 */
test.afterAll(async () => {
  await runCleanup();
  await teardownTestDatabase();
});

/**
 * Helper to login as specific user
 */
export async function loginAs(page: Page, user: typeof TEST_USERS.admin): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('input[name="email"]', { timeout: 15000 });

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();

  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');

  if (user.role === 'Admin') {
    await page.waitForURL(/\/admin/, { timeout: 20000 });
  } else {
    await page.waitForURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });
  }
}

/**
 * Helper to logout
 */
export async function logout(page: Page): Promise<void> {
  try {
    // Try to find and click logout button
    await page.click('button:has-text("Logout")', { timeout: 5000 });
    await page.waitForURL(/\/login/, { timeout: 10000 });
  } catch {
    // If logout button not found, clear cookies manually
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/login');
  }
}

/**
 * Capture console errors during test
 */
export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(`PAGE ERROR: ${error.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`CONSOLE ERROR: ${msg.text()}`);
    }
  });
  return errors;
}

/**
 * Capture failed network requests
 */
export function captureFailedRequests(page: Page): Array<{ url: string; status: number }> {
  const failed: Array<{ url: string; status: number }> = [];
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/api/')) {
      failed.push({ url: response.url(), status: response.status() });
    }
  });
  return failed;
}