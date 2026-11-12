import { test, expect } from '@playwright/test';

test('check console for errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', error => {
    errors.push(error.message);
    console.log('PAGE ERROR:', error.message);
  });
  
  await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="email"]');
  
  // Try invalid login
  await page.fill('input[name="email"]', 'invalid@test.com');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  console.log('All errors:', errors);
});
