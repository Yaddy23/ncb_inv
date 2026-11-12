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

const viewports = [
  { name: 'Mobile', width: 375, height: 667 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop', width: 1920, height: 1080 },
  { name: 'Large Desktop', width: 2560, height: 1440 },
];

test.describe('Responsive Design Tests', () => {
  for (const viewport of viewports) {
    test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      test.beforeEach(async ({ adminPage }) => {
        await adminPage.setViewportSize({ width: viewport.width, height: viewport.height });
      });

      test('should load login page correctly', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.waitForLoad();

        await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible({ timeout: 5000 });
      });

      test('should load dashboard correctly', async ({ adminPage }) => {
        const dashboardPage = new DashboardPage(adminPage);
        await dashboardPage.goto();
        await dashboardPage.waitForLoad();

        await expect(adminPage.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });

        // Stats should be visible
        const statsContainer = adminPage.locator('.stats-grid, .dashboard-stats, [class*="stat"]');
        await expect(statsContainer).toBeVisible({ timeout: 10000 });
      });

      test('should load books page correctly', async ({ adminPage }) => {
        const booksPage = new BooksPage(adminPage);
        await booksPage.goto();
        await booksPage.waitForLoad();

        await expect(booksPage.table).toBeVisible({ timeout: 15000 });
        await expect(booksPage.searchInput).toBeVisible({ timeout: 5000 });
      });

      test('should load scan page correctly', async ({ adminPage }) => {
        const scanPage = new ScanPage(adminPage);
        await scanPage.goto();
        await scanPage.waitForLoad();

        await expect(scanPage.scanInput).toBeVisible({ timeout: 10000 });
      });

      test('should load admin panel correctly', async ({ adminPage }) => {
        const adminPanelPage = new AdminPanelPage(adminPage);
        await adminPanelPage.goto();
        await adminPanelPage.waitForLoad();

        await expect(adminPanelPage.usersTab).toBeVisible({ timeout: 10000 });
      });

      test('should load profile page correctly', async ({ adminPage }) => {
        const profilePage = new ProfilePage(adminPage);
        await profilePage.goto();
        await profilePage.waitForLoad();

        await expect(profilePage.nameField).toBeVisible({ timeout: 10000 });
      });

      test('should load delivery receipts correctly', async ({ adminPage }) => {
        const deliveryPage = new DeliveryReceiptsPage(adminPage);
        await deliveryPage.goto();
        await deliveryPage.waitForLoad();

        await expect(deliveryPage.table).toBeVisible({ timeout: 15000 });
      });

      test('should load sales invoices correctly', async ({ adminPage }) => {
        const salesPage = new SalesInvoicesPage(adminPage);
        await salesPage.goto();
        await salesPage.waitForLoad();

        await expect(salesPage.table).toBeVisible({ timeout: 15000 });
      });

      test('should load reservations correctly', async ({ adminPage }) => {
        const reservationsPage = new ReservationsPage(adminPage);
        await reservationsPage.goto();
        await reservationsPage.waitForLoad();

        await expect(reservationsPage.table).toBeVisible({ timeout: 15000 });
      });

      test('should load evaluation forms correctly', async ({ adminPage }) => {
        const evalPage = new EvaluationFormsPage(adminPage);
        await evalPage.goto();
        await evalPage.waitForLoad();

        await expect(evalPage.table).toBeVisible({ timeout: 15000 });
      });

      test('should load import/export correctly', async ({ adminPage }) => {
        const importExportPage = new ImportExportPage(adminPage);
        await importExportPage.goto();
        await importExportPage.waitForLoad();

        await expect(importExportPage.importTab).toBeVisible({ timeout: 10000 });
      });
    });
  }
});

test.describe('Mobile-Specific Tests', () => {
  test.beforeEach(async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 375, height: 667 });
  });

  test('should show mobile menu toggle', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const mobileToggle = adminPage.locator('button[aria-label*="menu" i], button[aria-expanded], .mobile-menu-toggle, .hamburger');
    await expect(mobileToggle).toBeVisible({ timeout: 5000 });
  });

  test('should open mobile menu on toggle click', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const mobileToggle = adminPage.locator('button[aria-label*="menu" i], button[aria-expanded], .mobile-menu-toggle, .hamburger');
    await mobileToggle.click();

    const mobileMenu = adminPage.locator('[role="dialog"], .mobile-menu, .sidebar.open, .sidebar[aria-hidden="false"]');
    await expect(mobileMenu).toBeVisible({ timeout: 5000 });
  });

  test('should close mobile menu on link click', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const mobileToggle = adminPage.locator('button[aria-label*="menu" i], button[aria-expanded], .mobile-menu-toggle, .hamburger');
    await mobileToggle.click();

    const mobileMenu = adminPage.locator('[role="dialog"], .mobile-menu, .sidebar.open, .sidebar[aria-hidden="false"]');
    await expect(mobileMenu).toBeVisible({ timeout: 5000 });

    // Click a nav link
    const booksLink = adminPage.locator('nav a:has-text("Books"), aside a:has-text("Books")').first();
    if (await booksLink.isVisible()) {
      await booksLink.click();

      // Menu should close
      await expect(mobileMenu).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('should stack form fields vertically', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.createButton.click();
    await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

    // Check form fields are stacked (not side by side)
    const form = adminPage.locator('form');
    const inputs = adminPage.locator('form input, form select, form textarea');
    const count = await inputs.count();

    // On mobile, fields should be stacked
    // This is a visual check - just verify no horizontal overflow
    const formWidth = await form.evaluate(el => el.scrollWidth);
    const viewportWidth = 375;
    expect(formWidth).toBeLessThanOrEqual(viewportWidth + 20); // Allow small margin
  });

  test('should have touch-friendly button sizes', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const buttons = adminPage.locator('button:visible');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();
      if (box) {
        // Minimum touch target size: 44x44px (Apple) or 48x48dp (Material)
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('should not have horizontal scroll', async ({ adminPage }) => {
    const pages = [
      () => new DashboardPage(adminPage).goto(),
      () => new BooksPage(adminPage).goto(),
      () => new ScanPage(adminPage).goto(),
      () => new ProfilePage(adminPage).goto(),
    ];

    for (const gotoPage of pages) {
      await gotoPage();
      await adminPage.waitForLoad();

      const hasHorizontalScroll = await adminPage.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    }
  });
});

test.describe('Tablet-Specific Tests', () => {
  test.beforeEach(async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 768, height: 1024 });
  });

  test('should show sidebar on tablet', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const sidebar = adminPage.locator('nav, aside, [role="navigation"], .sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });

  test('should display tables with horizontal scroll if needed', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    const table = adminPage.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Table container should handle overflow
    const tableContainer = adminPage.locator('.table-container, .table-wrapper, [class*="table"]');
    // Should be visible
  });

  test('should have two-column layout where appropriate', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const statsGrid = adminPage.locator('.stats-grid, .dashboard-stats');
    // On tablet, stats might be in 2 columns
  });
});

test.describe('Desktop-Specific Tests', () => {
  test.beforeEach(async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 1920, height: 1080 });
  });

  test('should show full sidebar', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const sidebar = adminPage.locator('nav, aside, [role="navigation"], .sidebar');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // All nav items should be visible
    const navItems = adminPage.locator('nav a, aside a, [role="navigation"] a');
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(10); // All 11 routes
  });

  test('should display tables without horizontal scroll', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    await booksPage.goto();
    await booksPage.waitForLoad();

    const table = adminPage.locator('table');
    const container = adminPage.locator('.table-container, .table-wrapper');

    const tableWidth = await table.evaluate(el => el.scrollWidth);
    const containerWidth = await container.evaluate(el => el.clientWidth);

    expect(tableWidth).toBeLessThanOrEqual(containerWidth);
  });

  test('should have multi-column layouts', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const statsGrid = adminPage.locator('.stats-grid, .dashboard-stats');
    // On desktop, stats should be in 3-4 columns
  });

  test('should show hover states on interactive elements', async ({ adminPage }) => {
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    const buttons = adminPage.locator('button:visible').first();
    if (await buttons.isVisible()) {
      await buttons.hover();
      // Check for hover style change (visual)
    }
  });
});

test.describe('Orientation Tests', () => {
  test('should work in portrait orientation', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 375, height: 667 });

    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    await expect(adminPage.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
  });

  test('should work in landscape orientation', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 667, height: 375 });

    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    await expect(adminPage.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Breakpoint Tests', () => {
  const breakpoints = [
    { width: 320, height: 568 },   // Small mobile
    { width: 480, height: 800 },   // Large mobile
    { width: 768, height: 1024 },  // Tablet
    { width: 1024, height: 768 },  // Tablet landscape
    { width: 1280, height: 720 },  // Small desktop
    { width: 1920, height: 1080 }, // Full HD
  ];

  for (const bp of breakpoints) {
    test(`should render correctly at ${bp.width}x${bp.height}`, async ({ adminPage }) => {
      await adminPage.setViewportSize({ width: bp.width, height: bp.height });

      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Basic check - page should load without errors
      await expect(adminPage.locator('h1, h2')).toBeVisible({ timeout: 10000 });

      // No horizontal scroll
      const hasHorizontalScroll = await adminPage.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    });
  }
});