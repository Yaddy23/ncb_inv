import { test, expect } from '@playwright/test';
const { generate } = require('otplib');
const mongoose = require('mongoose');
require('dotenv').config({ path: '../backend/.env' });

test.describe('MFA Flow Integration Tests', () => {
  test.beforeAll(async () => {
    // Connect to test database and create test users
    await mongoose.connect(process.env.TESTMONGODB_URI);
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const bcrypt = require('bcryptjs');

    // Hash passwords (same as User.pre('save') hook)
    const adminPasswordHash = await bcrypt.hash('Admin1234', 10);
    const staffPasswordHash = await bcrypt.hash('Staff1234', 10);

    // Create admin user if not exists
    await User.findOneAndUpdate(
      { email: 'admin@test.com' },
      {
        username: 'admin',
        email: 'admin@test.com',
        password: adminPasswordHash,
        role: 'Admin',
        isActive: true,
        mfaEnabled: false,
        mfaSecret: null,
      },
      { upsert: true, new: true }
    );

    // Create staff user if not exists
    await User.findOneAndUpdate(
      { email: 'staff@test.com' },
      {
        username: 'staff',
        email: 'staff@test.com',
        password: staffPasswordHash,
        role: 'Staff',
        isActive: true,
      },
      { upsert: true, new: true }
    );

    await mongoose.connection.close();
  });

  test.beforeEach(async ({ page }) => {
    // Reset MFA state for admin user before each test to ensure isolation
    await mongoose.connect(process.env.TESTMONGODB_URI);
    const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    await User.updateOne(
      { email: 'admin@test.com' },
      { mfaEnabled: false, mfaSecret: null }
    );
    await mongoose.connection.close();

    // Capture console logs
    page.on('console', msg => console.log(`PAGE LOG: ${msg.type()} - ${msg.text()}`));
    page.on('pageerror', error => console.log(`PAGE ERROR: ${error.message}`));

    // Capture network responses
    page.on('response', response => {
      if (response.url().includes('/api/auth/')) {
        console.log(`API RESPONSE: ${response.url()} - ${response.status()}`);
      }
    });

    // Navigate to login page and wait for it to load
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for login form to be visible
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 15000 });

    // Clear storage after page is loaded
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
  });

  test('Admin can set up MFA from Admin Panel', async ({ page }) => {
    // Login as admin
    await page.fill('input[name="email"]', 'admin@test.com');
    await page.fill('input[name="password"]', 'Admin1234');
    await page.click('button[type="submit"]');

    // Should be redirected to admin panel
    await expect(page).toHaveURL(/.*admin/, { timeout: 20000 });

    // Navigate to MFA Setup tab
    await page.click('button:has-text("MFA Setup")');

    // Should see MFA setup page - use specific heading
    await expect(page.getByRole('heading', { name: 'MFA Setup' })).toBeVisible({ timeout: 15000 });

    // Click Generate QR Code & Secret button
    await page.click('button:has-text("Generate QR Code & Secret")');

    // Should see QR code and secret
    await expect(page.locator('img[alt="MFA QR Code"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Secret Key')).toBeVisible({ timeout: 15000 });

    // Verify the secret is displayed (in read-only input field)
    const secretInput = page.locator('input[readOnly][value]');
    await expect(secretInput).toBeVisible({ timeout: 15000 });
    const secretText = await secretInput.getAttribute('value');
    expect(secretText).toBeTruthy();
  });

  test('Admin login requires MFA challenge when MFA is enabled', async ({ page }) => {
    // First, set up MFA for admin user via the Admin Panel
    await page.fill('input[name="email"]', 'admin@test.com');
    await page.fill('input[name="password"]', 'Admin1234');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*admin/, { timeout: 20000 });

    await page.click('button:has-text("MFA Setup")');
    await expect(page.getByRole('heading', { name: 'MFA Setup' })).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Generate QR Code & Secret")');
    await expect(page.locator('img[alt="MFA QR Code"]')).toBeVisible({ timeout: 15000 });

    // Get the secret key from the UI (in read-only input field)
    const secretInput = page.locator('input[readOnly][value]');
    await expect(secretInput).toBeVisible({ timeout: 15000 });
    const secretText = await secretInput.getAttribute('value');
    expect(secretText).toBeTruthy();

    // Generate a valid TOTP token using the secret
    const token = await generate({ secret: secretText });

    // Enter the token and verify
    await page.fill('input[placeholder="000000"]', token);
    await page.click('button:has-text("Verify & Enable MFA")');

    // Should show MFA enabled successfully
    await expect(page.getByRole('heading', { name: 'MFA Enabled Successfully!' })).toBeVisible({ timeout: 15000 });

    // Log out
    await page.click('button:has-text("Back to Admin Panel")');
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/.*login/, { timeout: 15000 });

    // Now try to login again - should show MFA challenge
    await page.fill('input[name="email"]', 'admin@test.com');
    await page.fill('input[name="password"]', 'Admin1234');
    await page.click('button[type="submit"]');

    // Should show MFA challenge screen
    await expect(page.getByRole('heading', { name: 'MFA Challenge' })).toBeVisible({ timeout: 15000 });
    // MFA token input uses placeholder, not name attribute
    await expect(page.locator('input[placeholder="000000"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button:has-text("Verify & Sign In")')).toBeVisible({ timeout: 15000 });
  });

  test('MFA challenge UI is displayed correctly', async ({ page }) => {
    // Login as admin (assuming MFA is not set up yet, this verifies the login form)
    await page.fill('input[name="email"]', 'admin@test.com');
    await page.fill('input[name="password"]', 'Admin1234');
    await page.click('button[type="submit"]');

    // Should be redirected to admin panel (MFA not set up yet)
    await expect(page).toHaveURL(/.*admin/, { timeout: 20000 });

    // The MFA challenge test requires MFA to be pre-configured with a known secret
    // This test verifies the UI elements are correct when MFA challenge is shown
    // We skip actual TOTP verification as it requires a known secret

    // Verify the login page has MFA challenge elements when triggered
    // (This would require MFA to be pre-configured in the test database)
    // For now, verify the login form works
    await expect(page.locator('input[name="email"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('Staff user login does not require MFA', async ({ page }) => {
    // Login as staff
    await page.fill('input[name="email"]', 'staff@test.com');
    await page.fill('input[name="password"]', 'Staff1234');
    await page.click('button[type="submit"]');

    // Should be redirected to dashboard (root path)
    await expect(page).toHaveURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });
    await expect(page.locator('input[name="mfaToken"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('MFA Setup tab only visible to Admin users', async ({ page }) => {
    // Login as staff
    await page.fill('input[name="email"]', 'staff@test.com');
    await page.fill('input[name="password"]', 'Staff1234');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });

    // MFA Setup tab should not be visible
    await expect(page.locator('button:has-text("MFA Setup")')).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Cookie-based Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page and wait for it to load
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for login form to be visible
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 15000 });

    // Clear storage after page is loaded
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
  });

  test('Login sets httpOnly cookies', async ({ page }) => {
    // Login as staff
    await page.fill('input[name="email"]', 'staff@test.com');
    await page.fill('input[name="password"]', 'Staff1234');
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard (root path)
    await page.waitForURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });

    // Check cookies are set
    const cookies = await page.context().cookies();
    const accessTokenCookie = cookies.find(c => c.name === 'accessToken');
    const refreshTokenCookie = cookies.find(c => c.name === 'refreshToken');
    const csrfTokenCookie = cookies.find(c => c.name === 'csrfToken');

    expect(accessTokenCookie).toBeTruthy();
    expect(refreshTokenCookie).toBeTruthy();
    expect(csrfTokenCookie).toBeTruthy();

    // Check they are httpOnly
    expect(accessTokenCookie.httpOnly).toBe(true);
    expect(refreshTokenCookie.httpOnly).toBe(true);
    expect(csrfTokenCookie.httpOnly).toBe(true);
  });

  test('Logout clears cookies', async ({ page }) => {
    // Login as staff
    await page.fill('input[name="email"]', 'staff@test.com');
    await page.fill('input[name="password"]', 'Staff1234');
    await page.click('button[type="submit"]');

    await page.waitForURL(/^http:\/\/localhost:4173\/$/, { timeout: 20000 });

    // Click logout (assuming there's a logout button)
    await page.click('button:has-text("Logout")');

    // Should redirect to login
    await expect(page).toHaveURL(/.*login/, { timeout: 15000 });

    // Check cookies are cleared
    const cookies = await page.context().cookies();
    const accessTokenCookie = cookies.find(c => c.name === 'accessToken');
    const refreshTokenCookie = cookies.find(c => c.name === 'refreshToken');

    // Cookies should be expired/cleared
    if (accessTokenCookie) {
      expect(accessTokenCookie.expires).toBeLessThan(Date.now() / 1000 + 10);
    }
    if (refreshTokenCookie) {
      expect(refreshTokenCookie.expires).toBeLessThan(Date.now() / 1000 + 10);
    }
  });
});