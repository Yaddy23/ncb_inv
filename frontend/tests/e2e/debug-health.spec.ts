import { test, expect } from '@playwright/test';

test('check backend health', async ({ request }) => {
  const response = await request.get('http://localhost:8080/health');
  console.log('Health response:', response.status());
  const body = await response.json();
  console.log('Health body:', JSON.stringify(body, null, 2));
});