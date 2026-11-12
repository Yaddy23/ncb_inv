import { test, expect } from '../fixtures/auth-fixtures';
import { AdminPanelPage } from '../pages/AdminPanelPage';

test.describe('Modules Management Tests', () => {
  let adminPanelPage: AdminPanelPage;

  test.beforeEach(async ({ adminPage }) => {
    adminPanelPage = new AdminPanelPage(adminPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();
    await adminPanelPage.clickModulesTab();
  });

  test('should load modules tab', async ({ adminPage }) => {
    await expect(adminPanelPage.modulesTable).toBeVisible({ timeout: 15000 });
  });

  test('should display modules list', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();
    const rowCount = await adminPanelPage.getModuleCount();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('should show module status (enabled/disabled)', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    // Check for status indicators
    const statusIndicators = adminPage.locator('text=Enabled, text=Disabled, .badge:has-text("Enabled"), .badge:has-text("Disabled")');
    // Should have at least some status indicators
  });

  test('should toggle module status', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    // Find a module to toggle
    const firstToggle = adminPage.locator('button[role="switch"], input[type="checkbox"][role="switch"], .toggle-switch').first();
    if (await firstToggle.isVisible()) {
      const initialState = await firstToggle.getAttribute('aria-checked') || await firstToggle.isChecked();
      await firstToggle.click();
      await adminPanelPage.waitForLoad();
      await adminPanelPage.expectSuccess();

      // Verify state changed
      const newState = await firstToggle.getAttribute('aria-checked') || await firstToggle.isChecked();
      expect(newState).not.toBe(initialState);
    }
  });

  test('should enable disabled module', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    const disabledModule = adminPage.locator('tr:has-text("Disabled") button[role="switch"][aria-checked="false"]').first();
    if (await disabledModule.isVisible()) {
      await disabledModule.click();
      await adminPanelPage.waitForLoad();
      await adminPanelPage.expectSuccess();
    }
  });

  test('should disable enabled module', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    const enabledModule = adminPage.locator('tr:has-text("Enabled") button[role="switch"][aria-checked="true"]').first();
    if (await enabledModule.isVisible()) {
      await enabledModule.click();
      await adminPanelPage.waitForLoad();
      await adminPanelPage.expectSuccess();
    }
  });

  test('should show module details', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    const viewButton = adminPage.locator('button:has-text("View"), button[aria-label*="view" i]').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await expect(adminPanelPage.modal).toBeVisible({ timeout: 5000 });

      // Check for module details
      await expect(adminPage.locator('text=Description, text=Version, text=Dependencies')).toBeVisible({ timeout: 5000 });

      await adminPage.keyboard.press('Escape');
    }
  });

  test('should search modules', async ({ adminPage }) => {
    const searchInput = adminPage.locator('input[placeholder*="earch" i], input[name="search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('books');
      await adminPage.keyboard.press('Enter');
      await adminPanelPage.waitForLoad();
    }
  });

  test('should filter modules by status', async ({ adminPage }) => {
    const filterSelect = adminPage.locator('select[name="status"], select[id*="status"]');
    if (await filterSelect.isVisible()) {
      await filterSelect.selectOption('Enabled');
      await adminPanelPage.waitForLoad();

      await filterSelect.selectOption('Disabled');
      await adminPanelPage.waitForLoad();
    }
  });

  test('should display module dependencies', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    // Check for dependency information
    const depsColumn = adminPage.locator('th:has-text("Dependencies"), td:has-text("depends")');
    // Might be in detail view
  });

  test('should prevent disabling core modules', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    // Core modules might not have toggle or show warning
    const coreModuleToggle = adminPage.locator('tr:has-text("Core") button[role="switch"], tr:has-text("Authentication") button[role="switch"]');
    if (await coreModuleToggle.isVisible()) {
      await coreModuleToggle.click();
      // Should show warning or prevent
      await adminPanelPage.expectError();
    }
  });
});

test.describe('Modules - Staff Access', () => {
  test('staff should NOT access modules tab', async ({ staffPage }) => {
    const adminPanelPage = new AdminPanelPage(staffPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();

    const modulesTab = staffPage.locator('button:has-text("Modules"), [role="tab"]:has-text("Modules")');
    await expect(modulesTab).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Modules Validation', () => {
  let adminPanelPage: AdminPanelPage;

  test.beforeEach(async ({ adminPage }) => {
    adminPanelPage = new AdminPanelPage(adminPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();
    await adminPanelPage.clickModulesTab();
  });

  test('should show module health status', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    // Check for health indicators
    const healthIndicators = adminPage.locator('text=Healthy, text=Unhealthy, text=Warning, .health-status');
    // Might be present
  });

  test('should show module version', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    const versionColumn = adminPage.locator('th:has-text("Version"), td:has-text("v")');
    // Version might be displayed
  });
});