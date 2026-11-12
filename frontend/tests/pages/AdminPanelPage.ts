import { Page, Locator, expect } from '@playwright/test';

export class AdminPanelPage {
  readonly page: Page;
  readonly tabs: Locator;
  readonly usersTab: Locator;
  readonly mfaSetupTab: Locator;
  readonly maintenanceTab: Locator;
  readonly userTable: Locator;
  readonly addUserButton: Locator;
  readonly userModal: Locator;
  readonly userForm: Locator;
  readonly mfaQrCode: Locator;
  readonly mfaSecretInput: Locator;
  readonly mfaTokenInput: Locator;
  readonly generateQrButton: Locator;
  readonly verifyMfaButton: Locator;
  readonly disableMfaButton: Locator;
  readonly maintenanceToggle: Locator;
  readonly maintenanceMessageInput: Locator;
  readonly saveMaintenanceButton: Locator;
  readonly maintenanceStatus: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabs = page.locator('[role="tablist"], .tabs');
    this.usersTab = page.locator('button:has-text("Users"), [role="tab"]:has-text("Users")');
    this.mfaSetupTab = page.locator('button:has-text("MFA Setup"), [role="tab"]:has-text("MFA Setup")');
    this.maintenanceTab = page.locator('button:has-text("Maintenance"), [role="tab"]:has-text("Maintenance")');
    this.userTable = page.locator('table:has(th:has-text("Username")), .users-table');
    this.addUserButton = page.locator('button:has-text("Add User"), button:has-text("Create User")');
    this.userModal = page.locator('[role="dialog"], .modal');
    this.userForm = page.locator('form:has(input[name="email"])');
    this.mfaQrCode = page.locator('img[alt="MFA QR Code"], .qr-code img');
    this.mfaSecretInput = page.locator('input[readOnly][value], input[name="secret"]');
    this.mfaTokenInput = page.locator('input[placeholder="000000"], input[name="mfaToken"]');
    this.generateQrButton = page.locator('button:has-text("Generate QR Code")');
    this.verifyMfaButton = page.locator('button:has-text("Verify & Enable MFA")');
    this.disableMfaButton = page.locator('button:has-text("Disable MFA")');
    this.maintenanceToggle = page.locator('input[type="checkbox"][name="maintenanceMode"], label:has-text("Maintenance Mode") input');
    this.maintenanceMessageInput = page.locator('textarea[name="maintenanceMessage"], input[name="maintenanceMessage"]');
    this.saveMaintenanceButton = page.locator('button:has-text("Save"), button:has-text("Update")');
    this.maintenanceStatus = page.locator('text=Maintenance Mode, .maintenance-status');
    this.errorMessage = page.locator('.text-red-600, .text-red-500, [role="alert"]');
    this.successMessage = page.locator('.text-green-600, .text-green-500, .toast-success');
  }

  async goto() {
    await this.page.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.tabs).toBeVisible({ timeout: 15000 });
  }

  async clickUsersTab() {
    await this.usersTab.click();
    await expect(this.userTable).toBeVisible({ timeout: 10000 });
  }

  async clickMfaSetupTab() {
    await this.mfaSetupTab.click();
    await expect(page.getByRole('heading', { name: 'MFA Setup' })).toBeVisible({ timeout: 10000 });
  }

  async clickMaintenanceTab() {
    await this.maintenanceTab.click();
    await expect(this.maintenanceStatus).toBeVisible({ timeout: 10000 });
  }

  async addUser(email: string, password: string, role: 'Admin' | 'Staff' = 'Staff') {
    await this.clickUsersTab();
    await this.addUserButton.click();
    await expect(this.userModal).toBeVisible({ timeout: 5000 });

    await this.userForm.locator('input[name="email"]').fill(email);
    await this.userForm.locator('input[name="password"]').fill(password);
    await this.userForm.locator('select[name="role"]').selectOption(role);
    await this.userForm.locator('button[type="submit"]').click();

    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
    await expect(this.userModal).not.toBeVisible({ timeout: 5000 });
  }

  async generateMfaQr() {
    await this.clickMfaSetupTab();
    await this.generateQrButton.click();
    await expect(this.mfaQrCode).toBeVisible({ timeout: 10000 });
    await expect(this.mfaSecretInput).toBeVisible({ timeout: 5000 });
  }

  async getMfaSecret(): Promise<string> {
    return await this.mfaSecretInput.getAttribute('value') || '';
  }

  async verifyMfa(token: string) {
    await this.mfaTokenInput.fill(token);
    await this.verifyMfaButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async disableMfa() {
    await this.clickMfaSetupTab();
    await this.disableMfaButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async enableMaintenanceMode(message?: string) {
    await this.clickMaintenanceTab();

    if (!(await this.maintenanceToggle.isChecked())) {
      await this.maintenanceToggle.click();
    }

    if (message) {
      await this.maintenanceMessageInput.fill(message);
    }

    await this.saveMaintenanceButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async disableMaintenanceMode() {
    await this.clickMaintenanceTab();

    if (await this.maintenanceToggle.isChecked()) {
      await this.maintenanceToggle.click();
      await this.saveMaintenanceButton.click();
      await expect(this.successMessage).toBeVisible({ timeout: 10000 });
    }
  }

  async expectMaintenanceEnabled() {
    await expect(this.maintenanceToggle).toBeChecked();
  }

  async expectMaintenanceDisabled() {
    await expect(this.maintenanceToggle).not.toBeChecked();
  }

  async getUserCount(): Promise<number> {
    await this.clickUsersTab();
    const rows = await this.userTable.locator('tbody tr').all();
    return rows.length;
  }

  async expectUserInTable(email: string) {
    await this.clickUsersTab();
    await expect(this.page.locator(`tr:has-text("${email}")`)).toBeVisible({ timeout: 5000 });
  }

  async expectError(message?: string) {
    await expect(this.errorMessage).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectSuccess(message?: string) {
    await expect(this.successMessage).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(this.successMessage).toContainText(message);
    }
  }
}