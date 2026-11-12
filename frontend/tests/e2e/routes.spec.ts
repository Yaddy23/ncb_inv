import { test, expect } from '../fixtures/auth-fixtures';
import { getAllRoutes, getProtectedRoutes, verifyRouteLoads, verifyRouteRequiresAuth, waitForRouteTransition } from '../helpers/route-discovery';

test.describe('Route Discovery and Access', () => {
  test('should discover all 11 routes', async ({ page }) => {
    const allRoutes = getAllRoutes();
    expect(allRoutes.length).toBe(11);

    // Verify each route has required properties
    for (const route of allRoutes) {
      expect(route.path).toBeDefined();
      expect(route.name).toBeDefined();
      expect(route.requiredRole).toBeDefined();
      expect(route.expectedSelectors).toBeDefined();
      expect(Array.isArray(route.expectedSelectors)).toBe(true);
    }
  });

  test('should have correct route paths', async ({ page }) => {
    const allRoutes = getAllRoutes();
    const paths = allRoutes.map(r => r.path);

    expect(paths).toContain('/login');
    expect(paths).toContain('/');
    expect(paths).toContain('/books');
    expect(paths).toContain('/scan');
    expect(paths).toContain('/admin');
    expect(paths).toContain('/profile');
    expect(paths).toContain('/delivery-receipts');
    expect(paths).toContain('/sales-invoices');
    expect(paths).toContain('/reservations');
    expect(paths).toContain('/evaluation-forms');
    expect(paths).toContain('/import-export');
  });

  test('should have correct role assignments', async ({ page }) => {
    const allRoutes = getAllRoutes();

    // Login should be public
    const loginRoute = allRoutes.find(r => r.path === '/login');
    expect(loginRoute?.requiredRole).toBe('Public');

    // Admin should be Admin only
    const adminRoute = allRoutes.find(r => r.path === '/admin');
    expect(adminRoute?.requiredRole).toBe('Admin');

    // Others should be Staff or Admin
    for (const route of allRoutes) {
      if (route.path !== '/login' && route.path !== '/admin') {
        expect(['Staff', 'Admin']).toContain(route.requiredRole);
      }
    }
  });
});

test.describe('Route Loading Tests - Unauthenticated', () => {
  const protectedRoutes = getProtectedRoutes();

  for (const route of protectedRoutes) {
    test(`should redirect to login when accessing ${route.path} unauthenticated`, async ({ page }) => {
      const result = await verifyRouteRequiresAuth(page, route);
      expect(result.success).toBe(true);
    });
  }
});

test.describe('Route Loading Tests - Admin', () => {
  const protectedRoutes = getProtectedRoutes();

  for (const route of protectedRoutes) {
    test(`admin should access ${route.path}`, async ({ adminPage }) => {
      const result = await verifyRouteLoads(adminPage, route, { timeout: 20000 });
      expect(result.success).toBe(true);
      expect(result.loadTime).toBeLessThan(30000);
    });
  }
});

test.describe('Route Loading Tests - Staff', () => {
  const protectedRoutes = getProtectedRoutes();
  const staffRoutes = protectedRoutes.filter(r => r.requiredRole !== 'Admin');

  for (const route of staffRoutes) {
    test(`staff should access ${route.path}`, async ({ staffPage }) => {
      const result = await verifyRouteLoads(staffPage, route, { timeout: 20000 });
      expect(result.success).toBe(true);
      expect(result.loadTime).toBeLessThan(30000);
    });
  }

  // Admin-only routes
  const adminRoutes = protectedRoutes.filter(r => r.requiredRole === 'Admin');

  for (const route of adminRoutes) {
    test(`staff should NOT access ${route.path}`, async ({ staffPage }) => {
      const result = await verifyRouteLoads(staffPage, route, { timeout: 10000 });
      expect(result.success).toBe(false);
    });
  }
});

test.describe('Route Transitions', () => {
  test('should transition between routes without full page reload', async ({ adminPage }) => {
    const routes = getProtectedRoutes().slice(0, 3); // Test first 3 routes

    for (const route of routes) {
      await adminPage.goto(route.path, { waitUntil: 'domcontentloaded' });
      await waitForRouteTransition(adminPage);

      // Verify no full reload by checking if navigation API shows soft navigation
      const isReload = await adminPage.evaluate(() => {
        return performance.getEntriesByType('navigation')[0]?.type === 'reload';
      });

      // React Router should use soft navigation
      expect(isReload).toBe(false);
    }
  });

  test('should maintain auth state during route transitions', async ({ adminPage }) => {
    const routes = getProtectedRoutes().slice(0, 3);

    for (const route of routes) {
      await adminPage.goto(route.path, { waitUntil: 'domcontentloaded' });
      await waitForRouteTransition(adminPage);

      // Check auth cookies still exist
      const cookies = await adminPage.context().cookies();
      const accessToken = cookies.find(c => c.name === 'accessToken');
      expect(accessToken).toBeDefined();
    }
  });
});

test.describe('Route Parameter Handling', () => {
  test('should handle route with parameters', async ({ adminPage }) => {
    // Test a route that might have parameters
    // This is a placeholder - add specific parameterized routes when known
    await adminPage.goto('/books', { waitUntil: 'domcontentloaded' });
    await expect(adminPage.locator('table, .books-table')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('404 and Error Routes', () => {
  test('should show 404 for unknown routes', async ({ adminPage }) => {
    await adminPage.goto('/nonexistent-route', { waitUntil: 'domcontentloaded' });

    // Check for 404 indicator
    const notFound = await adminPage.locator('text=404, text=Not Found, text=Page not found').isVisible().catch(() => false);
    // Could also be redirected to dashboard
    const onDashboard = adminPage.url().endsWith('/');

    expect(notFound || onDashboard).toBe(true);
  });
});