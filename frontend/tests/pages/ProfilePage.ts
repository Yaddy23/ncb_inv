import { Page, Locator, expect } from '@playwright/test';

export class ProfilePage {
  readonly page: Page;
  readonly profileForm: Locator;
  readonly usernameInput: Locator;
  readonly emailInput: Locator;
  readonly currentPasswordInput: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly saveProfileButton: Locator;
  readonly changePasswordButton: Locator;
  readonly sessionsSection: Locator;
  readonly sessionList: Locator;
  readonly revokeSessionButton: Locator;
  readonly revokeAllSessionsButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.profileForm = page.locator('form:has(input[name="username"])');
    this.usernameInput = page.locator('input[name="username"]');
    this.emailInput = page.locator('input[name="email"]');
    this.currentPasswordInput = page.locator('input[name="currentPassword"]');
    this.newPasswordInput = page.locator('input[name="newPassword"]');
    this.confirmPasswordInput = page.locator('input[name="confirmPassword"]');
    this.saveProfileButton = page.locator('button:has-text("Save Profile")');
    this.changePasswordButton = page.locator('button:has-text("Change Password")');
    this.sessionsSection = page.locator('text=Active Sessions').locator('..');
    this.sessionList = page.locator('.session-list, [data-testid="session-list"]');
    this.revokeSessionButton = page.locator('button:has-text("Revoke")');
    this.revokeAllSessionsButton = page.locator('button:has-text("Revoke All")');
    this.errorMessage = page.locator('.text-red-600, .text-red-500, [role="alert"]');
    this.successMessage = page.locator('.text-green-600, .text-green-500, .toast-success');
  }

  async goto() {
    await this.page.goto('/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.profileForm).toBeVisible({ timeout: 15000 });
  }

  async updateProfile(username: string, email: string) {
    await this.usernameInput.fill(username);
    await this.emailInput.fill(email);
    await this.saveProfileButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    await this.currentPasswordInput.fill(currentPassword);
    await this.newPasswordInput.fill(newPassword);
    await this.confirmPasswordInput.fill(newPassword);
    await this.changePasswordButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async revokeSession(sessionIndex: number = 0) {
    const buttons = await this.revokeSessionButton.all();
    if (buttons[sessionIndex]) {
      await buttons[sessionIndex].click();
      await expect(this.successMessage).toBeVisible({ timeout: 5000 });
    }
  }

  async revokeAllSessions() {
    await this.revokeAllSessionsButton.click();
    // Confirm dialog
    await this.page.locator('button:has-text("Confirm"), button:has-text("Yes")').click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async getSessionCount(): Promise<number> {
    const sessions = await this.sessionList.locator('.session-item, tr').all();
    return sessions.length;
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

  async getProfileData() {
    return {
      username: await this.usernameInput.inputValue(),
      email: await this.emailInput.inputValue(),
    };
  }
}