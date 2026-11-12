import { test, expect } from '../fixtures/auth-fixtures';
import { LoginPage } from '../pages/LoginPage';
import { TEST_USERS } from '../fixtures/auth-fixtures';
import { verifyRouteLoads, getProtectedRoutes } from '../helpers/route-discovery';

test.describe('Authentication Tests', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('should load login page without errors', async ({ page }) => {
    await expect(page).toHaveTitle(/New Century Books Inventory Management System/);
    await loginPage.waitForLoad();
    await loginPage.expectNoError();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await loginPage.login('invalid@test.com', 'wrongpassword');
    await loginPage.expectError('Invalid email or password');
  });

  test('should show error for empty email', async ({ page }) => {
    await loginPage.loginExpectingValidationError('', 'Admin1234');
    await loginPage.expectError('Email is required');
  });

  test('should show error for empty password', async ({ page }) => {
    await loginPage.loginExpectingValidationError('admin@test.com', '');
    await loginPage.expectError('Password is required');
  });

  test('should login successfully as admin', async ({ page }) => {
    await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
    await page.waitForURL(/\/admin/, { timeout: 20000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  test('should login successfully as staff', async ({ page }) => {
    await loginPage.login(TEST_USERS.staff.email, TEST_USERS.staff.password);
    await page.waitForURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });
    await expect(page).toHaveURL(/^http:\/\/localhost:4173\/$/);
  });

  test('should set httpOnly cookies on login', async ({ page }) => {
    await loginPage.login(TEST_USERS.staff.email, TEST_USERS.staff.password);
    await page.waitForURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });

    const cookies = await loginPage.hasHttpOnlyCookies();
    expect(cookies.accessToken).toBe(true);
    expect(cookies.refreshToken).toBe(true);
    expect(cookies.csrfToken).toBe(true);
  });

  test('should clear cookies on logout', async ({ page }) => {
    await loginPage.login(TEST_USERS.staff.email, TEST_USERS.staff.password);
    await page.waitForURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });

    await page.click('button:has-text("Logout")');
    await page.waitForURL(/\/login/, { timeout: 15000 });

    const cookies = await page.context().cookies();
    const accessToken = cookies.find(c => c.name === 'accessToken');
    const refreshToken = cookies.find(c => c.name === 'refreshToken');

    if (accessToken) {
      expect(accessToken.expires).toBeLessThan(Date.now() / 1000 + 10);
    }
    if (refreshToken) {
      expect(refreshToken.expires).toBeLessThan(Date.now() / 1000 + 10);
    }
  });

  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    await page.goto('/books', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect admin to admin panel after login', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login(TEST_USERS.admin.email, TEST_USERS.admin.password);
    await page.waitForURL(/\/admin/, { timeout: 20000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  test('should redirect staff to dashboard after login', async ({ page }) => {
    await loginPage.goto();
    await loginPage.login(TEST_USERS.staff.email, TEST_USERS.staff.password);
    await page.waitForURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });
    await expect(page).toHaveURL(/^http:\/\/localhost:4173\/$/);
  });
});

test.describe('Route Access Control', () => {
  const protectedRoutes = getProtectedRoutes();

  for (const route of protectedRoutes) {
    test(`should require authentication for ${route.path}`, async ({ page }) => {
      // Clear auth
      await page.context().clearCookies();
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      const result = await verifyRouteLoads(page, route);
      // Should fail to load (redirect to login)
      expect(result.success).toBe(false);
    });
  }

  test('admin should access all routes', async ({ adminPage }) => {
    for (const route of protectedRoutes) {
      const result = await verifyRouteLoads(adminPage, route, { timeout: 20000 });
      expect(result.success).toBe(true);
    }
  });

  test('staff should access staff routes', async ({ staffPage }) => {
    const staffRoutes = protectedRoutes.filter(r => r.requiredRole !== 'Admin');

    for (const route of staffRoutes) {
      const result = await verifyRouteLoads(staffPage, route, { timeout: 20000 });
      expect(result.success).toBe(true);
    }
  });

  test('staff should NOT access admin-only routes', async ({ staffPage }) => {
    const adminRoutes = protectedRoutes.filter(r => r.requiredRole === 'Admin');

    for (const route of adminRoutes) {
      const result = await verifyRouteLoads(staffPage, route, { timeout: 10000 });
      // Should be denied or redirected
      expect(result.success).toBe(false);
    }
  });
});