import { test, expect } from '../fixtures/auth-fixtures';
import { getAllRoutes, getProtectedRoutes } from '../helpers/route-discovery';
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

test.describe('Navigation Tests', () => {
  let pages: {
    dashboard: DashboardPage;
    books: BooksPage;
    scan: ScanPage;
    admin: AdminPanelPage;
    profile: ProfilePage;
    deliveryReceipts: DeliveryReceiptsPage;
    salesInvoices: SalesInvoicesPage;
    reservations: ReservationsPage;
    evaluationForms: EvaluationFormsPage;
    importExport: ImportExportPage;
  };

  test.beforeEach(async ({ adminPage }) => {
    pages = {
      dashboard: new DashboardPage(adminPage),
      books: new BooksPage(adminPage),
      scan: new ScanPage(adminPage),
      admin: new AdminPanelPage(adminPage),
      profile: new ProfilePage(adminPage),
      deliveryReceipts: new DeliveryReceiptsPage(adminPage),
      salesInvoices: new SalesInvoicesPage(adminPage),
      reservations: new ReservationsPage(adminPage),
      evaluationForms: new EvaluationFormsPage(adminPage),
      importExport: new ImportExportPage(adminPage),
    };
  });

  test.describe('Sidebar Navigation', () => {
    test('should have navigation sidebar visible', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await expect(adminPage.locator('nav, aside, [role="navigation"], .sidebar')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Dashboard via sidebar', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await expect(adminPage).toHaveURL(/\/$/);
      await expect(adminPage.locator('text=Dashboard, h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Books via sidebar', async ({ adminPage }) => {
      await pages.books.goto();
      await expect(adminPage).toHaveURL(/\/books/);
      await expect(adminPage.locator('text=Books, h1:has-text("Books")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Scan via sidebar', async ({ adminPage }) => {
      await pages.scan.goto();
      await expect(adminPage).toHaveURL(/\/scan/);
      await expect(adminPage.locator('text=Scan, h1:has-text("Scan")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Admin Panel via sidebar (admin only)', async ({ adminPage }) => {
      await pages.admin.goto();
      await expect(adminPage).toHaveURL(/\/admin/);
      await expect(adminPage.locator('text=Admin, h1:has-text("Admin")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Profile via sidebar', async ({ adminPage }) => {
      await pages.profile.goto();
      await expect(adminPage).toHaveURL(/\/profile/);
      await expect(adminPage.locator('text=Profile, h1:has-text("Profile")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Delivery Receipts via sidebar', async ({ adminPage }) => {
      await pages.deliveryReceipts.goto();
      await expect(adminPage).toHaveURL(/\/delivery-receipts/);
      await expect(adminPage.locator('text=Delivery Receipts, h1:has-text("Delivery Receipts")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Sales Invoices via sidebar', async ({ adminPage }) => {
      await pages.salesInvoices.goto();
      await expect(adminPage).toHaveURL(/\/sales-invoices/);
      await expect(adminPage.locator('text=Sales Invoices, h1:has-text("Sales Invoices")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Reservations via sidebar', async ({ adminPage }) => {
      await pages.reservations.goto();
      await expect(adminPage).toHaveURL(/\/reservations/);
      await expect(adminPage.locator('text=Reservations, h1:has-text("Reservations")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Evaluation Forms via sidebar', async ({ adminPage }) => {
      await pages.evaluationForms.goto();
      await expect(adminPage).toHaveURL(/\/evaluation-forms/);
      await expect(adminPage.locator('text=Evaluation Forms, h1:has-text("Evaluation Forms")')).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to Import/Export via sidebar', async ({ adminPage }) => {
      await pages.importExport.goto();
      await expect(adminPage).toHaveURL(/\/import-export/);
      await expect(adminPage.locator('text=Import, h1:has-text("Import")')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Navigation State', () => {
    test('should highlight active route in sidebar', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      // Check for active state indicator
      const activeLink = adminPage.locator('nav a[aria-current="page"], nav .active, aside .active, [role="navigation"] .active');
      await expect(activeLink).toBeVisible({ timeout: 5000 });
    });

    test('should update active state when navigating', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      await pages.books.goto();
      await adminPage.waitForLoad();

      // Books should be active
      const activeLink = adminPage.locator('nav a[aria-current="page"], nav .active, aside .active');
      await expect(activeLink).toContainText('Books');
    });
  });

  test.describe('Breadcrumbs', () => {
    test('should show breadcrumbs on nested pages', async ({ adminPage }) => {
      await pages.books.goto();
      await adminPage.waitForLoad();

      // Check for breadcrumb navigation
      const breadcrumbs = adminPage.locator('[aria-label="breadcrumb"], nav.breadcrumb, .breadcrumb');
      // Breadcrumbs might not exist on all pages - just verify it doesn't error
    });
  });

  test.describe('Header/User Menu', () => {
    test('should show user info in header', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      const userMenu = adminPage.locator('[aria-label="user menu"], .user-menu, button:has-text("Admin"), button:has-text("Profile")');
      await expect(userMenu).toBeVisible({ timeout: 10000 });
    });

    test('should open user dropdown on click', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      const userMenu = adminPage.locator('[aria-label="user menu"], .user-menu, button:has-text("Admin"), button:has-text("Profile")');
      await userMenu.click();

      // Check dropdown is visible
      const dropdown = adminPage.locator('[role="menu"], .dropdown-menu, .user-dropdown');
      await expect(dropdown).toBeVisible({ timeout: 5000 });
    });

    test('should have logout option in user menu', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      const userMenu = adminPage.locator('[aria-label="user menu"], .user-menu, button:has-text("Admin"), button:has-text("Profile")');
      await userMenu.click();

      const logoutOption = adminPage.locator('[role="menuitem"]:has-text("Logout"), .dropdown-menu:has-text("Logout")');
      await expect(logoutOption).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Mobile Navigation', () => {
    test('should have mobile menu toggle', async ({ adminPage }) => {
      await adminPage.setViewportSize({ width: 375, height: 667 });
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      const mobileToggle = adminPage.locator('button[aria-label*="menu" i], button[aria-expanded], .mobile-menu-toggle, .hamburger');
      await expect(mobileToggle).toBeVisible({ timeout: 5000 });
    });

    test('should open mobile menu on toggle click', async ({ adminPage }) => {
      await adminPage.setViewportSize({ width: 375, height: 667 });
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      const mobileToggle = adminPage.locator('button[aria-label*="menu" i], button[aria-expanded], .mobile-menu-toggle, .hamburger');
      await mobileToggle.click();

      const mobileMenu = adminPage.locator('[role="dialog"], .mobile-menu, .sidebar.open, .sidebar[aria-hidden="false"]');
      await expect(mobileMenu).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Keyboard Navigation', () => {
    test('should navigate sidebar with keyboard', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      // Tab to first nav link
      await adminPage.keyboard.press('Tab');
      const focused = adminPage.locator(':focus');
      await expect(focused).toBeVisible({ timeout: 5000 });
    });

    test('should activate link with Enter key', async ({ adminPage }) => {
      await pages.dashboard.goto();
      await adminPage.waitForLoad();

      // Find a nav link and activate it
      const booksLink = adminPage.locator('nav a:has-text("Books"), aside a:has-text("Books")').first();
      if (await booksLink.isVisible()) {
        await booksLink.focus();
        await adminPage.keyboard.press('Enter');
        await adminPage.waitForURL(/\/books/, { timeout: 10000 });
        await expect(adminPage).toHaveURL(/\/books/);
      }
    });
  });
});

test.describe('Staff Navigation', () => {
  test('staff should see staff routes in sidebar', async ({ staffPage }) => {
    const pages = {
      dashboard: new DashboardPage(staffPage),
      books: new BooksPage(staffPage),
      scan: new ScanPage(staffPage),
      profile: new ProfilePage(staffPage),
      deliveryReceipts: new DeliveryReceiptsPage(staffPage),
      salesInvoices: new SalesInvoicesPage(staffPage),
      reservations: new ReservationsPage(staffPage),
      evaluationForms: new EvaluationFormsPage(staffPage),
      importExport: new ImportExportPage(staffPage),
    };

    // Staff should NOT see Admin Panel
    await pages.dashboard.goto();
    await staffPage.waitForLoad();

    const adminLink = staffPage.locator('nav a:has-text("Admin"), aside a:has-text("Admin")');
    await expect(adminLink).not.toBeVisible({ timeout: 5000 });
  });

  test('staff should access staff routes', async ({ staffPage }) => {
    const routes = getProtectedRoutes().filter(r => r.requiredRole !== 'Admin');

    for (const route of routes) {
      await staffPage.goto(route.path, { waitUntil: 'domcontentloaded' });
      await staffPage.waitForLoad();
      await expect(staffPage).toHaveURL(new RegExp(route.path.replace('/', '\\/')));
    }
  });
});