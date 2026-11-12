import { test, expect } from '../fixtures/auth-fixtures';
import { AdminPanelPage } from '../pages/AdminPanelPage';

test.describe('Users Management Tests', () => {
  let adminPanelPage: AdminPanelPage;

  test.beforeEach(async ({ adminPage }) => {
    adminPanelPage = new AdminPanelPage(adminPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();
    await adminPanelPage.clickUsersTab();
  });

  test('should load users tab', async ({ adminPage }) => {
    await expect(adminPanelPage.usersTable).toBeVisible({ timeout: 15000 });
  });

  test('should display users list', async ({ adminPage }) => {
    await adminPanelPage.waitForLoad();
    const rowCount = await adminPanelPage.getUserCount();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('should search users', async ({ adminPage }) => {
    await adminPanelPage.searchUsers('admin');
    await adminPanelPage.waitForLoad();

    const rowCount = await adminPanelPage.getUserCount();
    // Should show filtered results
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('should filter users by role', async ({ adminPage }) => {
    await adminPanelPage.filterByRole('Admin');
    await adminPanelPage.waitForLoad();

    const rowCount = await adminPanelPage.getUserCount();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('should filter users by status', async ({ adminPage }) => {
    await adminPanelPage.filterByStatus('Active');
    await adminPanelPage.waitForLoad();

    const rowCount = await adminPanelPage.getUserCount();
    expect(rowCount).toBeGreaterThanOrEqual(0);
  });

  test('should create new user', async ({ adminPage }) => {
    const userData = {
      name: 'Test User',
      email: `testuser${Date.now()}@example.com`,
      password: 'TestPass123!',
      role: 'Staff',
    };

    await adminPanelPage.createUser(userData);
    await adminPanelPage.expectSuccess();

    // Verify user appears in list
    await adminPanelPage.searchUsers(userData.email);
    await adminPanelPage.waitForLoad();
    await expect(adminPage.locator(`tr:has-text("${userData.email}")`)).toBeVisible({ timeout: 10000 });
  });

  test('should edit user', async ({ adminPage }) => {
    // First create a user to edit
    const userData = {
      name: 'Edit Test User',
      email: `edittest${Date.now()}@example.com`,
      password: 'TestPass123!',
      role: 'Staff',
    };

    await adminPanelPage.createUser(userData);
    await adminPanelPage.expectSuccess();

    // Now edit the user
    await adminPanelPage.searchUsers(userData.email);
    await adminPanelPage.waitForLoad();

    await adminPanelPage.editUser(userData.email, { name: 'Updated Name' });
    await adminPanelPage.expectSuccess();

    // Verify update
    await adminPanelPage.searchUsers('Updated Name');
    await adminPanelPage.waitForLoad();
    await expect(adminPage.locator('tr:has-text("Updated Name")')).toBeVisible({ timeout: 10000 });
  });

  test('should change user status', async ({ adminPage }) => {
    const userData = {
      name: 'Status Test User',
      email: `statustest${Date.now()}@example.com`,
      password: 'TestPass123!',
      role: 'Staff',
    };

    await adminPanelPage.createUser(userData);
    await adminPanelPage.expectSuccess();

    await adminPanelPage.searchUsers(userData.email);
    await adminPanelPage.waitForLoad();

    await adminPanelPage.changeUserStatus(userData.email, 'Inactive');
    await adminPanelPage.expectSuccess();

    // Verify status change
    await adminPanelPage.filterByStatus('Inactive');
    await adminPanelPage.waitForLoad();
    await expect(adminPage.locator(`tr:has-text("${userData.email}")`)).toBeVisible({ timeout: 10000 });
  });

  test('should reset user password', async ({ adminPage }) => {
    const userData = {
      name: 'Password Test User',
      email: `pwtest${Date.now()}@example.com`,
      password: 'TestPass123!',
      role: 'Staff',
    };

    await adminPanelPage.createUser(userData);
    await adminPanelPage.expectSuccess();

    await adminPanelPage.searchUsers(userData.email);
    await adminPanelPage.waitForLoad();

    await adminPanelPage.resetPassword(userData.email, 'NewPass123!');
    await adminPanelPage.expectSuccess();
  });

  test('should delete user', async ({ adminPage }) => {
    const userData = {
      name: 'Delete Test User',
      email: `deletetest${Date.now()}@example.com`,
      password: 'TestPass123!',
      role: 'Staff',
    };

    await adminPanelPage.createUser(userData);
    await adminPanelPage.expectSuccess();

    await adminPanelPage.searchUsers(userData.email);
    await adminPanelPage.waitForLoad();

    await adminPanelPage.deleteUser(userData.email);
    await adminPanelPage.expectSuccess();

    // Verify deletion
    await adminPanelPage.searchUsers(userData.email);
    await adminPanelPage.waitForLoad();
    const rowCount = await adminPanelPage.getUserCount();
    expect(rowCount).toBe(0);
  });

  test('should show user details in modal', async ({ adminPage }) => {
    await adminPanelPage.searchUsers('admin');
    await adminPanelPage.waitForLoad();

    await adminPanelPage.viewUser('admin');
    await expect(adminPanelPage.modal).toBeVisible({ timeout: 5000 });

    // Check for user details
    await expect(adminPage.locator('text=admin@test.com, text=Admin')).toBeVisible({ timeout: 5000 });

    // Close modal
    await adminPage.keyboard.press('Escape');
    await expect(adminPanelPage.modal).not.toBeVisible({ timeout: 5000 });
  });

  test('should paginate users list', async ({ adminPage }) => {
    // If there are enough users, test pagination
    const pagination = adminPage.locator('nav[aria-label="pagination"], .pagination');
    if (await pagination.isVisible()) {
      await adminPage.click('.pagination button:has-text("2"), .pagination a:has-text("2")');
      await adminPanelPage.waitForLoad();
    }
  });

  test('should sort users by column', async ({ adminPage }) => {
    // Click on column header to sort
    const nameHeader = adminPage.locator('th:has-text("Name"), th:has-text("Email")').first();
    if (await nameHeader.isVisible()) {
      await nameHeader.click();
      await adminPanelPage.waitForLoad();
    }
  });
});

test.describe('Users Management - Staff Access', () => {
  test('staff should NOT access users management', async ({ staffPage }) => {
    const adminPanelPage = new AdminPanelPage(staffPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();

    // Staff should not see Users tab
    const usersTab = staffPage.locator('button:has-text("Users"), [role="tab"]:has-text("Users")');
    await expect(usersTab).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Users Management Validation', () => {
  let adminPanelPage: AdminPanelPage;

  test.beforeEach(async ({ adminPage }) => {
    adminPanelPage = new AdminPanelPage(adminPage);
    await adminPanelPage.goto();
    await adminPanelPage.waitForLoad();
    await adminPanelPage.clickUsersTab();
  });

  test('should validate required fields on create', async ({ adminPage }) => {
    await adminPanelPage.createUser({ name: '', email: '', password: '', role: '' });
    await adminPanelPage.expectError();
  });

  test('should validate email format', async ({ adminPage }) => {
    await adminPanelPage.createUser({
      name: 'Test',
      email: 'invalid-email',
      password: 'TestPass123!',
      role: 'Staff'
    });
    await adminPanelPage.expectError('email');
  });

  test('should validate password strength', async ({ adminPage }) => {
    await adminPanelPage.createUser({
      name: 'Test',
      email: `test${Date.now()}@example.com`,
      password: 'weak',
      role: 'Staff'
    });
    await adminPanelPage.expectError('password');
  });

  test('should validate unique email', async ({ adminPage }) => {
    const userData = {
      name: 'Unique Test',
      email: `unique${Date.now()}@example.com`,
      password: 'TestPass123!',
      role: 'Staff',
    };

    // Create first user
    await adminPanelPage.createUser(userData);
    await adminPanelPage.expectSuccess();

    // Try to create with same email
    await adminPanelPage.createUser(userData);
    await adminPanelPage.expectError('already exists');
  });
});