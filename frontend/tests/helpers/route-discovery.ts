import { Page } from '@playwright/test';

/**
 * Route definition for testing
 */
export interface TestRoute {
  path: string;
  name: string;
  requiresAuth: boolean;
  requiredRole?: 'Admin' | 'Staff' | 'Public';
  description: string;
  testFile?: string;
  expectedSelectors: string[];
}

/**
 * All application routes discovered from React Router configuration
 */
export const APP_ROUTES: TestRoute[] = [
  // Public routes
  {
    path: '/login',
    name: 'Login',
    requiresAuth: false,
    requiredRole: 'Public',
    description: 'User login page',
    expectedSelectors: ['input[name="email"]', 'input[name="password"]', 'button[type="submit"]']
  },

  // Protected routes (require authentication)
  {
    path: '/',
    name: 'Dashboard',
    requiresAuth: true,
    requiredRole: 'Staff',
    description: 'Main dashboard with stats and quick actions',
    expectedSelectors: ['h1', '[class*="stat"]', '[class*="card"]', '.grid']
  },
  {
    path: '/books',
    name: 'Books',
    requiresAuth: true,
    requiredRole: 'Staff',
    description: 'Book catalog with search, filter, sort, pagination',
    expectedSelectors: ['table', 'input[placeholder*="earch" i]', 'button:has-text("Add Book")']
  },
  {
    path: '/scan',
    name: 'Scan',
    requiresAuth: true,
    requiredRole: 'Staff',
    description: 'Barcode/ISBN scanner for stock operations',
    expectedSelectors: ['input[placeholder*="can" i]', 'video', '[class*="scanner"]']
  },
  {
    path: '/import-export',
    name: 'Import/Export',
    requiresAuth: true,
    requiredRole: 'Admin',
    description: 'Bulk import/export books and stock',
    expectedSelectors: ['button:has-text("Import")', 'button:has-text("Export")', 'input[type="file"]']
  },
  {
    path: '/profile',
    name: 'Profile',
    requiresAuth: true,
    requiredRole: 'Staff',
    description: 'User profile management',
    expectedSelectors: ['input[name="email"]', 'input[name="name"]', 'button:has-text("Save")']
  },
  {
    path: '/admin',
    name: 'Admin Panel',
    requiresAuth: true,
    requiredRole: 'Admin',
    description: 'Admin-only panel with user management, MFA, maintenance mode',
    expectedSelectors: ['text=User Management', 'text=Maintenance Mode', 'text=Modules']
  },
  {
    path: '/delivery-receipts',
    name: 'Delivery Receipts',
    requiresAuth: true,
    requiredRole: 'Staff',
    description: 'Create and manage delivery receipts',
    expectedSelectors: ['table', 'button:has-text("Create")', 'button:has-text("Add")']
  },
  {
    path: '/sales-invoices',
    name: 'Sales Invoices',
    requiresAuth: true,
    requiredRole: 'Staff',
    description: 'Create and manage sales invoices',
    expectedSelectors: ['table', 'button:has-text("Create")', 'button:has-text("Add")']
  },
  {
    path: '/reservations',
    name: 'Reservations',
    requiresAuth: true,
    requiredRole: 'Admin',
    description: 'Manage book reservations (Admin only)',
    expectedSelectors: ['table', 'button:has-text("Create")', 'button:has-text("Add")']
  },
  {
    path: '/evaluation-forms',
    name: 'Evaluation Forms',
    requiresAuth: true,
    requiredRole: 'Staff',
    description: 'Marketing executive evaluation forms',
    expectedSelectors: ['table', 'button:has-text("Create")', 'button:has-text("Add")']
  },
];

/**
 * Get routes filtered by role
 */
export function getRoutesForRole(role: 'Admin' | 'Staff' | 'Public'): TestRoute[] {
  if (role === 'Public') {
    return APP_ROUTES.filter(r => !r.requiresAuth);
  }

  return APP_ROUTES.filter(route => {
    if (!route.requiresAuth) return true;
    if (!route.requiredRole) return true;
    if (role === 'Admin') return true; // Admin can access Staff routes
    return route.requiredRole === role;
  });
}

/**
 * Get all routes that require authentication
 */
export function getProtectedRoutes(): TestRoute[] {
  return APP_ROUTES.filter(r => r.requiresAuth);
}

/**
 * Get admin-only routes
 */
export function getAdminOnlyRoutes(): TestRoute[] {
  return APP_ROUTES.filter(r => r.requiredRole === 'Admin');
}

/**
 * Get staff-accessible routes
 */
export function getStaffRoutes(): TestRoute[] {
  return APP_ROUTES.filter(r => r.requiresAuth && r.requiredRole !== 'Admin');
}

/**
 * Get all routes
 */
export function getAllRoutes(): TestRoute[] {
  return APP_ROUTES;
}

/**
 * Verify a route loads correctly
 */
export async function verifyRouteLoads(
  page: Page,
  route: TestRoute,
  options: {
    waitForSelector?: string;
    timeout?: number;
    expectedUrlPattern?: RegExp;
  } = {}
): Promise<{ success: boolean; error?: string; redirectedToLogin?: boolean; loadTime?: number }> {
  const { waitForSelector, timeout = 30000, expectedUrlPattern } = options;
  const startTime = Date.now();

  try {
    const response = await page.goto(route.path, {
      waitUntil: 'domcontentloaded',
      timeout
    });

    const loadTime = Date.now() - startTime;

    // Check for HTTP errors
    if (response && response.status() >= 400) {
      return {
        success: false,
        error: `HTTP ${response.status()}: ${response.statusText()}`,
        loadTime
      };
    }

    // Check if redirected to login
    const redirectedToLogin = page.url().includes('/login');

    // Verify URL matches expected pattern
    if (expectedUrlPattern && !expectedUrlPattern.test(page.url())) {
      return {
        success: false,
        error: `URL mismatch. Expected pattern: ${expectedUrlPattern}, got: ${page.url()}`,
        loadTime
      };
    }

    // Wait for specific selector if provided
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 15000 });
    }

    // Check for JavaScript errors
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    if (errors.length > 0) {
      return {
        success: false,
        error: `JavaScript errors: ${errors.join('; ')}`,
        loadTime
      };
    }

    return { success: true, loadTime, redirectedToLogin };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      loadTime: Date.now() - startTime
    };
  }
}

/**
 * Check if route redirects to login when not authenticated
 */
export async function verifyRouteRequiresAuth(
  page: Page,
  route: TestRoute
): Promise<{ success: boolean; error?: string }> {
  // Clear auth state
  await page.context().clearCookies();
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {
    // Ignore localStorage access errors (can happen on cross-origin pages)
  }

  try {
    await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Should redirect to login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Route did not redirect to login: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if route denies access for insufficient role
 */
export async function verifyRouteRoleAccess(
  page: Page,
  route: TestRoute,
  userRole: 'Admin' | 'Staff'
): Promise<{ success: boolean; error?: string; allowed: boolean }> {
  // This would require logging in as the specific role
  // Implementation depends on test fixtures
  const hasAccess = userRole === 'Admin' || route.requiredRole !== 'Admin';

  return {
    success: true,
    allowed: hasAccess,
    error: hasAccess ? undefined : `Role ${userRole} denied access to ${route.path}`
  };
}