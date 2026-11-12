import { test, expect } from '@playwright/test';

test('inspect login page', async ({ page }) => {
  await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="email"]');
  
  console.log('Page title:', await page.title());
  console.log('Page URL:', page.url());
  
  // Check error message selectors
  const errorElements = await page.locator('.text-red-600, .text-red-500, [role="alert"], .error, .alert, .text-red-400').all();
  console.log('Error elements found:', errorElements.length);
  
  for (const el of errorElements) {
    const text = await el.textContent();
    console.log('Error element text:', text);
  }
  
  // Check all text on page for error-like content
  const bodyText = await page.locator('body').textContent();
  console.log('Body text contains "error":', bodyText?.toLowerCase().includes('error'));
  console.log('Body text contains "invalid":', bodyText?.toLowerCase().includes('invalid'));
  console.log('Body text contains "required":', bodyText?.toLowerCase().includes('required'));
  
  // Try invalid login to see error
  await page.fill('input[name="email"]', 'invalid@test.com');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  console.log('After invalid login - URL:', page.url());
  
  const errorElementsAfter = await page.locator('.text-red-600, .text-red-500, [role="alert"], .error, .alert, .text-red-400, .text-red-700').all();
  console.log('Error elements after login:', errorElementsAfter.length);
  
  for (const el of errorElementsAfter) {
    const text = await el.textContent();
    console.log('Error element after text:', text);
  }
  
  // Check all text after
  const bodyTextAfter = await page.locator('body').textContent();
  console.log('Full body text after:', bodyTextAfter?.substring(0, 500));
});
