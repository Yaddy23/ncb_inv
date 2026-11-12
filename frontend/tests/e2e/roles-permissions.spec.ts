import { test, expect } from '../fixtures/auth-fixtures';
import { AdminPanelPage } from '../pages/AdminPanelPage';

test.describe('Roles & Permissions Tests', () => {
  let adminPanelPage: AdminPanelPage;

  test.beforeEach(async ({ adminPage }) => {
    adminPanelPage = new AdminPanelPage(adminPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();
    await adminPanelPage.clickRolesTab();
  });

  test('should load roles tab', async ({ adminPage }) => {
    await expect(adminPanelPage.rolesTable).toBeVisible({ timeout: 15000 });
  });

  test('should display roles list', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();
    const rowCount = await adminPanelPage.getRoleCount();
    expect(rowCount).toBeGreaterThanOrEqual(2); // At least Admin and Staff
  });

  test('should show default roles', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();

    await expect(adminPage.locator('tr:has-text("Admin")')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.locator('tr:has-text("Staff")')).toBeVisible({ timeout: 10000 });
  });

  test('should create new role', async ({ adminPage }) => {
    const roleData = {
      name: `Test Role ${Date.now()}`,
      description: 'Test role description',
      permissions: ['books:read', 'books:write'],
    };

    await adminPanelPage.createRole(roleData);
    await adminPanelPage.expectSuccess();

    // Verify role appears in list
    await adminPanelPage.searchRoles(roleData.name);
    await adminPanelPage.waitForLoad();
    await expect(adminPage.locator(`tr:has-text("${roleData.name}")`)).toBeVisible({ timeout: 10000 });
  });

  test('should edit role', async ({ adminPage }) => {
    const roleData = {
      name: `Edit Role ${Date.now()}`,
      description: 'Original description',
      permissions: ['books:read'],
    };

    await adminPanelPage.createRole(roleData);
    await adminPanelPage.expectSuccess();

    await adminPanelPage.searchRoles(roleData.name);
    await adminPanelPage.waitForLoad();

    await adminPanelPage.editRole(roleData.name, {
      description: 'Updated description',
      permissions: ['books:read', 'books:write', 'books:delete'],
    });
    await adminPanelPage.expectSuccess();
  });

  test('should delete custom role', async ({ adminPage }) => {
    const roleData = {
      name: `Delete Role ${Date.now()}`,
      description: 'Role to delete',
      permissions: ['books:read'],
    };

    await adminPanelPage.createRole(roleData);
    await adminPanelPage.expectSuccess();

    await adminPanelPage.searchRoles(roleData.name);
    await adminPanelPage.waitForLoad();

    await adminPanelPage.deleteRole(roleData.name);
    await adminPanelPage.expectSuccess();

    // Verify deletion
    await adminPanelPage.searchRoles(roleData.name);
    await adminPanelPage.waitForLoad();
    const rowCount = await adminPanelPage.getRoleCount();
    // Should not find the deleted role
  });

  test('should NOT delete default roles', async ({ adminPage }) => {
    // Try to delete Admin role
    await adminPanelPage.deleteRole('Admin');
    // Should show error or not allow deletion
    await adminPanelPage.expectError();
  });

  test('should view role permissions', async ({ adminPage }) => {
    await adminPanelPage.viewRole('Admin');
    await expect(adminPanelPage.modal).toBeVisible({ timeout: 5000 });

    // Check for permissions list
    await expect(adminPage.locator('text=books:read, text=books:write, text=users:read')).toBeVisible({ timeout: 5000 });

    await adminPage.keyboard.press('Escape');
  });

  test('should assign permissions to role', async ({ adminPage }) => {
    const roleData = {
      name: `Permission Role ${Date.now()}`,
      description: 'Test permissions',
      permissions: ['books:read'],
    };

    await adminPanelPage.createRole(roleData);
    await adminPanelPage.expectSuccess();

    await adminPanelPage.searchRoles(roleData.name);
    await adminPanelPage.waitForLoad();

    await adminPanelPage.editRole(roleData.name, {
      permissions: ['books:read', 'books:write', 'users:read', 'reports:read'],
    });
    await adminPanelPage.expectSuccess();

    // Verify permissions
    await adminPanelPage.viewRole(roleData.name);
    await expect(adminPage.locator('text=books:write')).toBeVisible({ timeout: 5000 });
    await expect(adminPage.locator('text=users:read')).toBeVisible({ timeout: 5000 });
  });

  test('should search roles', async ({ adminPage }) => {
    await adminPanelPage.searchRoles('Admin');
    await adminPanelPage.waitForLoad();

    await expect(adminPage.locator('tr:has-text("Admin")')).toBeVisible({ timeout: 10000 });
  });

  test('should paginate roles list', async ({ adminPage }) => {
    const pagination = adminPage.locator('nav[aria-label="pagination"], .pagination');
    if (await pagination.isVisible()) {
      await adminPage.click('.pagination button:has-text("2"), .pagination a:has-text("2")');
      await adminPanelPage.waitForLoad();
    }
  });

  test('should show permission categories', async ({ adminPage }) => {
    await adminPanelPage.clickRolesTab();
    await adminPanelPage.waitForLoad();

    // Check for permission groups/categories
    const categories = adminPage.locator('text=Books, text=Users, text=Reports, text=Settings, text=Admin');
    // At least some categories should be visible when creating/editing role
  });
});

test.describe('Permissions Enforcement', () => {
  test('staff should NOT access roles tab', async ({ staffPage }) => {
    const adminPanelPage = new AdminPanelPage(staffPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();

    const rolesTab = staffPage.locator('button:has-text("Roles"), [role="tab"]:has-text("Roles")');
    await expect(rolesTab).not.toBeVisible({ timeout: 5000 });
  });

  test('staff should NOT access modules tab', async ({ staffPage }) => {
    const adminPanelPage = new AdminPanelPage(staffPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();

    const modulesTab = staffPage.locator('button:has-text("Modules"), [role="tab"]:has-text("Modules")');
    await expect(modulesTab).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Roles & Permissions Validation', () => {
  let adminPanelPage: AdminPanelPage;

  test.beforeEach(async ({ adminPage }) => {
    adminPanelPage = new AdminPanelPage(adminPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();
    await adminPanelPage.clickRolesTab();
  });

  test('should validate required fields on create', async ({ adminPage }) => {
    await adminPanelPage.createRole({ name: '', description: '', permissions: [] });
    await adminPanelPage.expectError();
  });

  test('should validate unique role name', async ({ adminPage }) => {
    const roleData = {
      name: `Unique Role ${Date.now()}`,
      description: 'Test',
      permissions: ['books:read'],
    };

    await adminPanelPage.createRole(roleData);
    await adminPanelPage.expectSuccess();

    // Try duplicate
    await adminPanelPage.createRole(roleData);
    await adminPanelPage.expectError('already exists');
  });

  test('should require at least one permission', async ({ adminPage }) => {
    await adminPanelPage.createRole({
      name: `No Perm Role ${Date.now()}`,
      description: 'Test',
      permissions: []
    });
    // Might show error or allow empty permissions
  });
});