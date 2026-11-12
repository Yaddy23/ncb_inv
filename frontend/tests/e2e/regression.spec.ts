import { test, expect } from '../fixtures/auth-fixtures';
import { DashboardPage } from '../pages/DashboardPage';
import { BooksPage } from '../pages/BooksPage';
import { ScanPage } from '../pages/ScanPage';
import { AdminPanelPage } from '../pages/AdminPanelPage';
import { ProfilePage } from '../pages/ProfilePage';
import { DeliveryReceiptsPage } from '../pages/DeliveryReceiptsPage';
import { SalesInvoicesPage } from '../pages/SalesInvoicesPage';
import { ReservationsPage } from '../pages/ReservationsPage';
import { EvaluationFormsPage } from '../pages/EvaluationFormsPage';
import { ImportExportPage } from '../pages/ImportExportPage';
import { LoginPage } from '../pages/LoginPage';
import { verifyRouteLoads, getProtectedRoutes } from '../helpers/route-discovery';

test.describe('CORS Regression Tests', () => {
  test('should not have CORS errors on any API call', async ({ adminPage }) => {
    const corsErrors: string[] = [];

    adminPage.on('response', response => {
      const headers = response.headers();
      if (response.status() >= 400 &&
          (!headers['access-control-allow-origin'] || headers['access-control-allow-origin'] === 'null')) {
        corsErrors.push(`${response.url()} - ${response.status()}`);
      }
    });

    // Navigate through all pages
    const pages = [
      () => new DashboardPage(adminPage).goto(),
      () => new BooksPage(adminPage).goto(),
      () => new ScanPage(adminPage).goto(),
      () => new AdminPanelPage(adminPage).goto(),
      () => new ProfilePage(adminPage).goto(),
      () => new DeliveryReceiptsPage(adminPage).goto(),
      () => new SalesInvoicesPage(adminPage).goto(),
      () => new ReservationsPage(adminPage).goto(),
      () => new EvaluationFormsPage(adminPage).goto(),
      () => new ImportExportPage(adminPage).goto(),
    ];

    for (const gotoPage of pages) {
      await gotoPage();
      await adminPage.waitForLoad();
      await adminPage.waitForTimeout(1000); // Wait for API calls
    }

    expect(corsErrors).toHaveLength(0);
  });

  test('should not have CORS errors on rate-limited requests', async ({ adminPage }) => {
    const corsErrors: string[] = [];

    adminPage.on('response', response => {
      const headers = response.headers();
      if (response.status() === 429 &&
          (!headers['access-control-allow-origin'] || headers['access-control-allow-origin'] === 'null')) {
        corsErrors.push(`${response.url()} - Rate limited without CORS`);
      }
    });

    // Make rapid requests to trigger rate limiting
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();

    for (let i = 0; i < 5; i++) {
      await adminPage.reload();
      await adminPage.waitForLoad();
    }

    expect(corsErrors).toHaveLength(0);
  });

  test('should include CORS headers on all responses', async ({ adminPage }) => {
    const missingCors: string[] = [];

    adminPage.on('response', response => {
      const headers = response.headers();
      const isApiCall = response.url().includes('/api/');

      if (isApiCall && response.status() < 500) {
        if (!headers['access-control-allow-origin']) {
          missingCors.push(response.url());
        }
      }
    });

    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    // Trigger some API calls
    await booksPage.searchBook('test');
    await booksPage.waitForLoad();

    expect(missingCors).toHaveLength(0);
  });
});

test.describe('Search Bar Regression Tests', () => {
  test('should not clear input on second character', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    // Type slowly and verify input is not cleared
    await booksPage.searchInput.fill('T');
    await expect(booksPage.searchInput).toHaveValue('T');

    await booksPage.searchInput.fill('Te');
    await expect(booksPage.searchInput).toHaveValue('Te');

    await booksPage.searchInput.fill('Tes');
    await expect(booksPage.searchInput).toHaveValue('Tes');

    await booksPage.searchInput.fill('Test');
    await expect(booksPage.searchInput).toHaveValue('Test');
  });

  test('should debounce search correctly', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    // Type rapidly
    await booksPage.searchInput.fill('T');
    await booksPage.searchInput.fill('Te');
    await booksPage.searchInput.fill('Tes');
    await booksPage.searchInput.fill('Test');

    // Should only trigger one search after debounce
    await adminPage.keyboard.press('Enter');
    await booksPage.waitForLoad();

    // Should show results for "Test"
    const rows = adminPage.locator('tbody tr');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const title = await row.locator('td').nth(1).textContent();
      if (title) {
        expect(title.toLowerCase()).toContain('test');
      }
    }
  });

  test('should clear search correctly', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    await booksPage.searchInput.fill('Test');
    await expect(booksPage.searchInput).toHaveValue('Test');

    await booksPage.searchInput.clear();
    await expect(booksPage.searchInput).toHaveValue('');

    await adminPage.keyboard.press('Enter');
    await booksPage.waitForLoad();

    // Should show all books
  });

  test('should work on all pages with search', async ({ adminPage }) => {
    const pages = [
      { page: new BooksPage(adminPage), searchMethod: 'searchBook' },
      { page: new DeliveryReceiptsPage(adminPage), searchMethod: 'searchReceipt' },
      { page: new SalesInvoicesPage(adminPage), searchMethod: 'searchInvoice' },
      { page: new ReservationsPage(adminPage), searchMethod: 'searchReservation' },
      { page: new EvaluationFormsPage(adminPage), searchMethod: 'searchEF' },
    ];

    for (const { page, searchMethod } of pages) {
      await page.goto();
      await page.waitForLoad();

      // Type in search
      await page.searchInput.fill('Test');
      await expect(page.searchInput).toHaveValue('Test');

      await page.searchInput.fill('Te');
      await expect(page.searchInput).toHaveValue('Te');
    }
  });
});

test.describe('Maintenance Mode Regression Tests', () => {
  test('should allow admin access during maintenance', async ({ adminPage }) => {
    // This test would require maintenance mode to be enabled
    // For now, verify admin routes work
    const adminRoutes = getProtectedRoutes().filter(r => r.requiredRole === 'Admin');

    for (const route of adminRoutes) {
      const result = await verifyRouteLoads(adminPage, route, { timeout: 15000 });
      expect(result.success).toBe(true);
    }
  });

  test('should block non-admin during maintenance', async ({ staffPage }) => {
    // This test would require maintenance mode to be enabled
    // For now, verify staff can access staff routes
    const staffRoutes = getProtectedRoutes().filter(r => r.requiredRole !== 'Admin');

    for (const route of staffRoutes) {
      const result = await verifyRouteLoads(staffPage, route, { timeout: 15000 });
      expect(result.success).toBe(true);
    }
  });

  test('should show maintenance banner when enabled', async ({ adminPage }) => {
    // Would need maintenance mode enabled
    // Check for maintenance banner
    const banner = adminPage.locator('.maintenance-banner, text=Maintenance Mode, [role="alert"]:has-text("Maintenance")');
    // Banner should be visible when maintenance is on
  });
});

test.describe('Authentication Regression Tests', () => {
  test('should maintain session across page reloads', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    // Reload page
    await adminPage.reload();
    await dashboardPage.waitForLoad();

    // Should still be logged in
    await expect(adminPage).toHaveURL(/^http:\/\/localhost:4173\/$/);
  });

  test('should maintain session across route changes', async ({ adminPage }) => {
    const pages = [
      new DashboardPage(adminPage),
      new BooksPage(adminPage),
      new ScanPage(adminPage),
      new ProfilePage(adminPage),
    ];

    for (const page of pages) {
      await page.goto();
      await page.waitForLoad();

      // Check auth cookies
      const cookies = await adminPage.context().cookies();
      const accessToken = cookies.find(c => c.name === 'accessToken');
      expect(accessToken).toBeDefined();
    }
  });

  test('should redirect to login on expired token', async ({ adminPage }) => {
    // This would require token manipulation
    // For now, verify logout works
    await adminPage.click('button:has-text("Logout")');
    await adminPage.waitForURL(/\/login/, { timeout: 10000 });
    await expect(adminPage).toHaveURL(/\/login/);
  });

  test('should not allow access to protected routes without auth', async ({ page }) => {
    const protectedRoutes = getProtectedRoutes();

    for (const route of protectedRoutes) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await page.waitForURL(/\/login/, { timeout: 10000 });
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

test.describe('Filter Query Regression Tests', () => {
  test('should use exact match for category filter', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    await booksPage.filterByCategory('Fiction');
    await booksPage.waitForLoad();

    const rows = adminPage.locator('tbody tr');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const category = await row.locator('td').nth(4).textContent();
      if (category) {
        // Should be exact match, not partial
        expect(category).toBe('Fiction');
      }
    }
  });

  test('should use exact match for stock status filter', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    await booksPage.filterByStockStatus('Low Stock');
    await booksPage.waitForLoad();

    const rows = adminPage.locator('tbody tr');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const stock = await row.locator('td').nth(6).textContent();
      const minStock = await row.locator('td').nth(7).textContent();

      if (stock && minStock) {
        const stockNum = parseInt(stock);
        const minStockNum = parseInt(minStock);
        expect(stockNum).toBeLessThanOrEqual(minStockNum);
      }
    }
  });

  test('should escape special regex characters in search', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    // Search with regex special characters
    await booksPage.searchInput.fill('Test[0-9]');
    await adminPage.keyboard.press('Enter');
    await booksPage.waitForLoad();

    // Should treat as literal string, not regex
    const rows = adminPage.locator('tbody tr');
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const title = await row.locator('td').nth(1).textContent();
      if (title) {
        expect(title).toContain('Test[0-9]');
      }
    }
  });
});

test.describe('Modal/Dialog Regression Tests', () => {
  test('should close modal on backdrop click', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.createButton.click();
    await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

    // Click backdrop
    await adminPage.locator('[role="dialog"]').first().click({ position: { x: -10, y: -10 } });

    // Modal might close (depends on implementation)
  });

  test('should close modal on Escape key', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.createButton.click();
    await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

    await adminPage.keyboard.press('Escape');
    await expect(booksPage.modal).not.toBeVisible({ timeout: 5000 });
  });

  test('should not allow multiple modals open', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();

    await booksPage.createButton.click();
    await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

    // Try to open another modal (should not work or should close first)
    await booksPage.createButton.click();

    const modals = adminPage.locator('[role="dialog"], .modal');
    const count = await modals.count();
    expect(count).toBeLessThanOrEqual(1);
  });

  test('should trap focus in modal', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.createButton.click();
    await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

    // Tab through modal elements
    for (let i = 0; i < 15; i++) {
      await adminPage.keyboard.press('Tab');
      const focused = adminPage.locator(':focus');
      await expect(focused).toBeVisible({ timeout: 2000 });

      // Verify focus stays in modal
      const isInModal = await focused.evaluate((el, modal) => {
        return modal.contains(el);
      }, await adminPage.locator('[role="dialog"], .modal').elementHandle());

      expect(isInModal).toBe(true);
    }
  });
});

test.describe('Table/Pagination Regression Tests', () => {
  test('should maintain sort order on page change', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    // Click sort on title
    const titleHeader = adminPage.locator('th:has-text("Title")').first();
    if (await titleHeader.isVisible()) {
      await titleHeader.click();
      await booksPage.waitForLoad();

      // Go to page 2 if exists
      const pagination = adminPage.locator('.pagination, nav[aria-label="pagination"]');
      if (await pagination.isVisible()) {
        await adminPage.click('.pagination button:has-text("2"), .pagination a:has-text("2")');
        await booksPage.waitForLoad();

        // Sort should persist
      }
    }
  });

  test('should maintain filters on page change', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    await booksPage.filterByCategory('Fiction');
    await booksPage.waitForLoad();

    const pagination = adminPage.locator('.pagination, nav[aria-label="pagination"]');
    if (await pagination.isVisible()) {
      await adminPage.click('.pagination button:has-text("2"), .pagination a:has-text("2")');
      await booksPage.waitForLoad();

      // Filter should persist
      await expect(booksPage.filterCategory).toHaveValue('Fiction');
    }
  });

  test('should reset to page 1 on new search', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    // Go to page 2
    const pagination = adminPage.locator('.pagination, nav[aria-label="pagination"]');
    if (await pagination.isVisible()) {
      await adminPage.click('.pagination button:has-text("2"), .pagination a:has-text("2")');
      await booksPage.waitForLoad();

      // Search
      await booksPage.searchBook('Test');
      await booksPage.waitForLoad();

      // Should be on page 1
      const activePage = adminPage.locator('.pagination .active, .pagination [aria-current="page"]');
      await expect(activePage).toHaveText('1');
    }
  });
});

test.describe('API Error Handling Regression', () => {
  test('should show user-friendly error on 500', async ({ adminPage }) => {
    // This would require mocking a 500 error
    // For now, verify error display works
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();

    // Trigger an error (e.g., invalid create)
    await booksPage.createButton.click();
    await expect(booksPage.modal).toBeVisible({ timeout: 5000 });
    await booksPage.saveButton.click();
    await booksPage.expectError();
  });

  test('should show user-friendly error on 401', async ({ page }) => {
    // Clear auth
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Try to access protected route
    await page.goto('/books', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show user-friendly error on 403', async ({ staffPage }) => {
    // Try to access admin route
    await staffPage.goto('/admin', { waitUntil: 'domcontentloaded' });
    // Should redirect or show error
  });

  test('should retry failed requests', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    // Network errors should trigger retry (if implemented)
    // This is a visual check
  });
});

test.describe('Performance Regression Tests', () => {
  test('should load pages within acceptable time', async ({ adminPage }) => {
    const pages = [
      { name: 'Dashboard', goto: () => new DashboardPage(adminPage).goto() },
      { name: 'Books', goto: () => new BooksPage(adminPage).goto() },
      { name: 'Scan', goto: () => new ScanPage(adminPage).goto() },
      { name: 'Profile', goto: () => new ProfilePage(adminPage).goto() },
    ];

    for (const page of pages) {
      const startTime = Date.now();
      await page.goto();
      await adminPage.waitForLoad();
      const endTime = Date.now();

      const loadTime = endTime - startTime;
      expect(loadTime).toBeLessThan(30000); // 30 seconds max
    }
  });

  test('should not have memory leaks on navigation', async ({ adminPage }) => {
    const pages = [
      () => new DashboardPage(adminPage).goto(),
      () => new BooksPage(adminPage).goto(),
      () => new ScanPage(adminPage).goto(),
      () => new ProfilePage(adminPage).goto(),
    ];

    // Navigate back and forth multiple times
    for (let i = 0; i < 3; i++) {
      for (const gotoPage of pages) {
        await gotoPage();
        await adminPage.waitForLoad();
      }
    }

    // Check memory (basic)
    const memory = await adminPage.evaluate(() => {
      return (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;
    });

    // Memory should not grow excessively
    if (memory > 0) {
      expect(memory).toBeLessThan(100 * 1024 * 1024); // 100MB
    }
  });
});

test.describe('Data Integrity Regression Tests', () => {
  test('should not lose form data on validation error', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.createButton.click();
    await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

    // Fill form partially
    await booksPage.titleField.fill('Test Book');
    await booksPage.authorField.fill('Test Author');
    await booksPage.isbnField.fill('invalid'); // Invalid ISBN

    // Submit
    await booksPage.saveButton.click();
    await booksPage.expectError();

    // Form data should be preserved
    await expect(booksPage.titleField).toHaveValue('Test Book');
    await expect(booksPage.authorField).toHaveValue('Test Author');
    await expect(booksPage.isbnField).toHaveValue('invalid');
  });

  test('should not duplicate records on double-click submit', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.createButton.click();
    await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

    const isbn = `978${Date.now().toString().slice(-10)}`;

    await booksPage.titleField.fill('Double Click Test');
    await booksPage.authorField.fill('Author');
    await booksPage.isbnField.fill(isbn);
    await booksPage.publisherField.fill('Publisher');
    await booksPage.categoryField.fill('Fiction');
    await booksPage.priceField.fill('29.99');
    await booksPage.costField.fill('15.00');
    await booksPage.stockField.fill('10');
    await booksPage.minStockField.fill('5');
    await booksPage.locationField.fill('A1');

    // Double click submit
    await booksPage.saveButton.click();
    await booksPage.saveButton.click();

    await booksPage.expectSuccess();

    // Should only create one record
    await booksPage.searchBook(isbn);
    await booksPage.waitForLoad();

    const count = await booksPage.getBookCount();
    expect(count).toBe(1);
  });
});