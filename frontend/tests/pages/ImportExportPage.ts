import { Page, Locator, expect } from '@playwright/test';

export class ImportExportPage {
  readonly page: Page;
  readonly importTab: Locator;
  readonly exportTab: Locator;
  readonly fileInput: Locator;
  readonly importTypeSelect: Locator;
  readonly importButton: Locator;
  readonly exportTypeSelect: Locator;
  readonly exportFormatSelect: Locator;
  readonly exportButton: Locator;
  readonly downloadLink: Locator;
  readonly importResults: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly progressBar: Locator;
  readonly templateDownloadButtons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.importTab = page.locator('button:has-text("Import"), [role="tab"]:has-text("Import")');
    this.exportTab = page.locator('button:has-text("Export"), [role="tab"]:has-text("Export")');
    this.fileInput = page.locator('input[type="file"]');
    this.importTypeSelect = page.locator('select[name="importType"], select[id*="importType"]');
    this.importButton = page.locator('button:has-text("Import"), button[type="submit"]');
    this.exportTypeSelect = page.locator('select[name="exportType"], select[id*="exportType"]');
    this.exportFormatSelect = page.locator('select[name="format"], select[id*="format"]');
    this.exportButton = page.locator('button:has-text("Export"), button[type="submit"]');
    this.downloadLink = page.locator('a[download], button:has-text("Download")');
    this.importResults = page.locator('.import-results, text=Imported, text=Failed, text=Skipped');
    this.errorMessage = page.locator('.text-red-600, .text-red-500, [role="alert"]');
    this.successMessage = page.locator('.text-green-600, .text-green-500, .toast-success');
    this.progressBar = page.locator('progress, .progress-bar, [role="progressbar"]');
    this.templateDownloadButtons = page.locator('a:has-text("Template"), button:has-text("Template")');
  }

  async goto() {
    await this.page.goto('/import-export', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.importTab).toBeVisible({ timeout: 15000 });
  }

  async clickImportTab() {
    await this.importTab.click();
    await expect(this.fileInput).toBeVisible({ timeout: 5000 });
  }

  async clickExportTab() {
    await this.exportTab.click();
    await expect(this.exportButton).toBeVisible({ timeout: 5000 });
  }

  async importFile(filePath: string, importType: 'books' | 'stock' = 'books') {
    await this.clickImportTab();
    await this.importTypeSelect.selectOption(importType);

    // Set file input
    await this.fileInput.setInputFiles(filePath);

    await this.importButton.click();

    // Wait for import to complete
    await expect(this.progressBar).toBeVisible({ timeout: 5000 });
    await expect(this.progressBar).not.toBeVisible({ timeout: 60000 });

    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async exportData(exportType: 'books' | 'stock' | 'transactions' = 'books', format: 'xlsx' | 'csv' = 'xlsx') {
    await this.clickExportTab();
    await this.exportTypeSelect.selectOption(exportType);
    await this.exportFormatSelect.selectOption(format);

    // Start download
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportButton.click();
    const download = await downloadPromise;

    return download;
  }

  async downloadTemplate(templateType: 'books' | 'stock') {
    await this.clickImportTab();
    const templateLink = this.page.locator(`a:has-text("${templateType} Template"), button:has-text("${templateType} Template")`);
    const downloadPromise = this.page.waitForEvent('download');
    await templateLink.click();
    return await downloadPromise;
  }

  async expectImportResults(expected: { imported?: number; failed?: number; skipped?: number }) {
    await expect(this.importResults).toBeVisible({ timeout: 10000 });

    if (expected.imported !== undefined) {
      await expect(this.importResults).toContainText(`Imported: ${expected.imported}`);
    }
    if (expected.failed !== undefined) {
      await expect(this.importResults).toContainText(`Failed: ${expected.failed}`);
    }
    if (expected.skipped !== undefined) {
      await expect(this.importResults).toContainText(`Skipped: ${expected.skipped}`);
    }
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
}