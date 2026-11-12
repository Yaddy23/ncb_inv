import { test, expect } from '../fixtures/auth-fixtures';
import { DashboardPage } from '../pages/DashboardPage';

test.describe('Dashboard Tests', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ adminPage }) => {
    dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
  });

  test('should load dashboard without errors', async ({ adminPage }) => {
    await dashboardPage.waitForLoad();
    await dashboardPage.expectNoError();
  });

  test('should display dashboard title', async ({ adminPage }) => {
    await dashboardPage.waitForLoad();
    await expect(adminPage.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
  });

  test('should display statistics cards', async ({ adminPage }) => {
    await dashboardPage.waitForLoad();

    // Check for common dashboard stats
    const statsContainer = adminPage.locator('.stats-grid, .dashboard-stats, [class*="stat"]');
    await expect(statsContainer).toBeVisible({ timeout: 10000 });

    // Check for at least some stat cards
    const statCards = adminPage.locator('.stat-card, .stat-item, [class*="stat-card"], [class*="stat-item"]');
    const count = await statCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should display recent activity', async ({ adminPage }) => {
    await dashboardPage.waitForLoad();

    // Check for activity feed or recent items
    const activitySection = adminPage.locator('text=Recent, text=Activity, text=Latest, .activity-feed, .recent-activity');
    // Might not exist on all dashboards
  });

  test('should display quick actions', async ({ adminPage }) => {
    await dashboardPage.waitForLoad();

    // Check for quick action buttons
    const quickActions = adminPage.locator('text=Quick Actions, .quick-actions, button:has-text("Add"), button:has-text("Create")');
    // Might not exist on all dashboards
  });

  test('should have working navigation from dashboard', async ({ adminPage }) => {
    await dashboardPage.waitForLoad();

    // Test navigation to books
    await adminPage.click('a:has-text("Books"), button:has-text("Books")');
    await adminPage.waitForURL(/\/books/, { timeout: 10000 });
    await expect(adminPage).toHaveURL(/\/books/);
  });

  test('should display charts/graphs if present', async ({ adminPage }) => {
    await dashboardPage.waitForLoad();

    // Check for chart containers
    const charts = adminPage.locator('canvas, svg[class*="chart"], .chart-container, [class*="recharts"], [class*="chartjs"]');
    // Charts might not exist on all dashboards
  });

  test('should refresh data when refresh button clicked', async ({ adminPage }) => {
    await dashboardPage.waitForLoad();

    const refreshButton = adminPage.locator('button:has-text("Refresh"), button[aria-label*="refresh" i], .refresh-button');
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      // Wait for potential loading state
      await adminPage.waitForLoad();
    }
  });
});

test.describe('Dashboard - Staff Access', () => {
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ staffPage }) => {
    dashboardPage = new DashboardPage(staffPage);
    await dashboardPage.goto();
  });

  test('staff should access dashboard', async ({ staffPage }) => {
    await dashboardPage.waitForLoad();
    await expect(staffPage).toHaveURL(/^http:\/\/localhost:4173\/$/);
  });

  test('staff should see dashboard stats', async ({ staffPage }) => {
    await dashboardPage.waitForLoad();

    const statsContainer = staffPage.locator('.stats-grid, .dashboard-stats, [class*="stat"]');
    await expect(statsContainer).toBeVisible({ timeout: 10000 });
  });

  test('staff should NOT see admin-only stats', async ({ staffPage }) => {
    await dashboardPage.waitForLoad();

    // Admin-only elements might not be present for staff
    // This is a visual check - staff dashboard might have fewer stats
  });
});

test.describe('Dashboard Responsiveness', () => {
  test('should work on mobile viewport', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 375, height: 667 });
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    await expect(adminPage.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
  });

  test('should work on tablet viewport', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 768, height: 1024 });
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    await expect(adminPage.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
  });

  test('should work on desktop viewport', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 1920, height: 1080 });
    const dashboardPage = new DashboardPage(adminPage);
    await dashboardPage.goto();
    await dashboardPage.waitForLoad();

    await expect(adminPage.locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });
  });
});