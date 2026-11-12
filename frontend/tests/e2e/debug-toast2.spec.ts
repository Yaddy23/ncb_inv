import { test, expect } from '@playwright/test';

test('check if toast context works', async ({ page }) => {
  await page.goto('http://localhost:4173/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="email"]');
  
  // Check for any fixed position elements
  const fixedElements = await page.locator('[class*="fixed"][class*="top"]').all();
  console.log('Fixed top elements:', fixedElements.length);
  
  for (const el of fixedElements) {
    const className = await el.getAttribute('class');
    console.log('Fixed element class:', className);
  }
  
  // Check all elements with role=alert or role=status
  const alertElements = await page.locator('[role="alert"], [role="status"]').all();
  console.log('Alert/Status elements:', alertElements.length);
  
  for (const el of alertElements) {
    const text = await el.textContent();
    console.log('Element text:', text);
  }
  
  // Try clicking submit with empty form to see if validation toast appears
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  
  const alertElementsAfter = await page.locator('[role="alert"], [role="status"]').all();
  console.log('Alert/Status elements after empty submit:', alertElementsAfter.length);
  
  for (const el of alertElementsAfter) {
    const text = await el.textContent();
    console.log('Element text:', text);
  }
  
  // Try invalid login again
  await page.fill('input[name="email"]', 'invalid@test.com');
  await page.fill('input[name="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);
  
  const alertElementsAfter2 = await page.locator('[role="alert"], [role="status"]').all();
  console.log('Alert/Status elements after invalid login:', alertElementsAfter2.length);
  
  for (const el of alertElementsAfter2) {
    const text = await el.textContent();
    console.log('Element text:', text);
  }
});
