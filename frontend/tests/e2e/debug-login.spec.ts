import { test, expect } from '@playwright/test';

test('debug staff login', async ({ page }) => {
  // Capture all network requests
  page.on('request', request => {
    if (request.url().includes('/api/auth/login')) {
      console.log('LOGIN REQUEST:', request.method(), request.url());
      console.log('LOGIN REQUEST HEADERS:', request.headers());
      console.log('LOGIN REQUEST POST DATA:', request.postData());
    }
  });

  page.on('response', async response => {
    if (response.url().includes('/api/auth/login')) {
      const body = await response.text();
      console.log('LOGIN RESPONSE:', response.status(), body);
      console.log('LOGIN RESPONSE HEADERS:', response.headers());
    }
  });

  await page.goto('http://localhost:4173/login');
  await page.waitForSelector('input[name="email"]');

  // Check what the form looks like
  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  const submitButton = page.locator('button[type="submit"]');

  console.log('Email input:', await emailInput.getAttribute('value'));
  console.log('Password input:', await passwordInput.getAttribute('value'));

  await emailInput.fill('staff@test.com');
  await passwordInput.fill('Staff1234');

  console.log('After fill - Email:', await emailInput.inputValue());
  console.log('After fill - Password:', await passwordInput.inputValue());

  await submitButton.click();
  await page.waitForTimeout(5000);

  console.log('Final URL:', page.url());

  // Check for error messages
  const errorMessages = await page.locator('text=Invalid, text=Error, text=Failed, .error, .alert').allTextContents();
  console.log('Error messages:', errorMessages);
});