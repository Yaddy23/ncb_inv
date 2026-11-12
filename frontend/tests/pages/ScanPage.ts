import { Page, Locator, expect } from '@playwright/test';

export class ScanPage {
  readonly page: Page;
  readonly cameraSelect: Locator;
  readonly startScanButton: Locator;
  readonly stopScanButton: Locator;
  readonly scanResult: Locator;
  readonly isbnInput: Locator;
  readonly lookupButton: Locator;
  readonly bookDetails: Locator;
  readonly actionSelect: Locator;
  readonly quantityInput: Locator;
  readonly processButton: Locator;
  readonly historyTable: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly flashToggle: Locator;
  readonly zoomControl: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cameraSelect = page.locator('select[name="camera"], select[id*="camera"]');
    this.startScanButton = page.locator('button:has-text("Start Scan"), button:has-text("Start Camera")');
    this.stopScanButton = page.locator('button:has-text("Stop Scan"), button:has-text("Stop Camera")');
    this.scanResult = page.locator('[data-testid="scan-result"], .scan-result');
    this.isbnInput = page.locator('input[name="isbn"], input[placeholder*="SBN" i]');
    this.lookupButton = page.locator('button:has-text("Lookup"), button:has-text("Search")');
    this.bookDetails = page.locator('.book-details, [data-testid="book-details"]');
    this.actionSelect = page.locator('select[name="action"], select[id*="action"]');
    this.quantityInput = page.locator('input[name="quantity"], input[type="number"]');
    this.processButton = page.locator('button:has-text("Process"), button:has-text("Submit")');
    this.historyTable = page.locator('table:has(th:has-text("ISBN")), .scan-history');
    this.errorMessage = page.locator('.text-red-600, .text-red-500, [role="alert"]');
    this.successMessage = page.locator('.text-green-600, .text-green-500, .toast-success');
    this.flashToggle = page.locator('button:has-text("Flash"), label:has-text("Flash") input');
    this.zoomControl = page.locator('input[type="range"][id*="zoom"], button:has-text("Zoom")');
  }

  async goto() {
    await this.page.goto('/scan', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.isbnInput).toBeVisible({ timeout: 15000 });
  }

  async startCamera() {
    await this.startScanButton.click();
    // Wait for camera to start
    await this.page.waitForTimeout(2000);
  }

  async stopCamera() {
    if (await this.stopScanButton.isVisible({ timeout: 2000 })) {
      await this.stopScanButton.click();
    }
  }

  async lookupIsbn(isbn: string) {
    await this.isbnInput.fill(isbn);
    await this.lookupButton.click();
    await expect(this.bookDetails).toBeVisible({ timeout: 10000 });
  }

  async processScan(action: 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT', quantity: number) {
    await this.actionSelect.selectOption(action);
    await this.quantityInput.fill(quantity.toString());
    await this.processButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async expectScanResult(expectedIsbn: string) {
    await expect(this.scanResult).toContainText(expectedIsbn, { timeout: 10000 });
  }

  async expectBookDetailsVisible() {
    await expect(this.bookDetails).toBeVisible({ timeout: 5000 });
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

  async getHistoryCount(): Promise<number> {
    const rows = await this.historyTable.locator('tbody tr').all();
    return rows.length;
  }
}