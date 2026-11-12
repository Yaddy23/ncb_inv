import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly mfaTokenInput: Locator;
  readonly mfaVerifyButton: Locator;
  readonly mfaChallengeHeading: Locator;
  readonly errorMessage: Locator;
  readonly rememberMeCheckbox: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.mfaTokenInput = page.locator('input[placeholder="000000"]');
    this.mfaVerifyButton = page.locator('button:has-text("Verify & Sign In")');
    this.mfaChallengeHeading = page.getByRole('heading', { name: 'MFA Challenge' });
    this.errorMessage = page.locator('.fixed [role="alert"]').first();
    this.rememberMeCheckbox = page.locator('input[name="rememberMe"]');
  }

  async goto() {
    await this.page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.emailInput).toBeVisible({ timeout: 15000 });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    // Wait for the API response after clicking submit
    let loginResponse: any = null;

    await Promise.all([
      this.submitButton.click(),
      this.page.waitForResponse(response => {
        if (response.url().includes('/auth/login')) {
          loginResponse = response;
          return true;
        }
        return false;
      }).catch(() => {})
    ]);

    // Log response for debugging
    if (loginResponse) {
      console.log('Login response status:', loginResponse.status());
      const body = await loginResponse.json().catch(() => ({}));
      console.log('Login response body:', body);
    } else {
      console.log('No login response captured');
    }
  }

  // For validation tests that don't make an API call
  async loginExpectingValidationError(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    // Wait for toast to appear
    await this.page.waitForTimeout(500);
  }

  async loginWithMfa(email: string, password: string, mfaToken: string) {
    await this.login(email, password);

    // Wait for MFA challenge
    await expect(this.mfaChallengeHeading).toBeVisible({ timeout: 15000 });
    await this.mfaTokenInput.fill(mfaToken);
    await this.mfaVerifyButton.click();
  }

  async expectMfaChallenge() {
    await expect(this.mfaChallengeHeading).toBeVisible({ timeout: 15000 });
    await expect(this.mfaTokenInput).toBeVisible({ timeout: 15000 });
    await expect(this.mfaVerifyButton).toBeVisible({ timeout: 15000 });
  }

  async expectError(message?: string) {
    await expect(this.errorMessage).toBeVisible({ timeout: 5000 });
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectNoError() {
    await expect(this.errorMessage).not.toBeVisible({ timeout: 2000 });
  }

  async clearForm() {
    await this.emailInput.clear();
    await this.passwordInput.clear();
  }

  async getCookies() {
    return await this.page.context().cookies();
  }

  async hasHttpOnlyCookies() {
    const cookies = await this.getCookies();
    const accessToken = cookies.find(c => c.name === 'accessToken');
    const refreshToken = cookies.find(c => c.name === 'refreshToken');
    const csrfToken = cookies.find(c => c.name === 'csrfToken');

    return {
      accessToken: accessToken?.httpOnly === true,
      refreshToken: refreshToken?.httpOnly === true,
      csrfToken: csrfToken?.httpOnly === true,
    };
  }
}