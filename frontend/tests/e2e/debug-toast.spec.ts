import { test, expect } from '@playwright/test';

test('inspect toast after invalid login', async ({ page }) => {
  await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="email"]');
  
  // Fill invalid credentials
  await page.fill('input[name="email"]', 'invalid@test.com');
  await page.fill('input[name="password"]', 'wrongpassword');
  
  // Listen for network response
  page.on('response', async response => {
    if (response.url().includes('/api/auth/login')) {
      console.log('LOGIN RESPONSE STATUS:', response.status());
      const body = await response.text();
      console.log('LOGIN RESPONSE BODY:', body);
    }
  });
  
  // Click submit
  await page.click('button[type="submit"]');
  
  // Wait a bit for toast to appear
  await page.waitForTimeout(1000);
  
  // Check for toast
  const toasts = await page.locator('[role="alert"]').all();
  console.log('Toast elements with role=alert:', toasts.length);
  
  for (const toast of toasts) {
    const text = await toast.textContent();
    console.log('Toast text:', text);
  }
  
  // Also check for all toast-like elements
  const allToasts = await page.locator('.animate-slide-up, .animate-fade-out, [role="alert"], [role="status"]').all();
  console.log('All toast-like elements:', allToasts.length);
  
  for (const toast of allToasts) {
    const text = await toast.textContent();
    const className = await toast.getAttribute('class');
    console.log('Toast class:', className, 'text:', text);
  }
});
