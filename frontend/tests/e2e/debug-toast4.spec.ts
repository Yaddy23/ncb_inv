import { test, expect } from '@playwright/test';

test('check if login component catches error', async ({ page }) => {
  await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="email"]');
  
  // Try invalid login
  await page.fill('input[name="email"]', 'invalid@test.com');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  // Check if toast container has any children now
  const toastContainer = page.locator('[class*="fixed"][class*="top"][class*="right"][class*="z-50"]');
  const children = await toastContainer.locator('> *').all();
  console.log('Toast container children:', children.length);
  
  for (const child of children) {
    const html = await child.innerHTML();
    console.log('Child HTML:', html.substring(0, 200));
  }
});
