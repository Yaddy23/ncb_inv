import { Page, Locator, expect } from '@playwright/test';

export class DeliveryReceiptsPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly drTable: Locator;
  readonly drRows: Locator;
  readonly searchInput: Locator;
  readonly filterStatus: Locator;
  readonly customerSelect: Locator;
  readonly dateFrom: Locator;
  readonly dateTo: Locator;
  readonly modal: Locator;
  readonly form: Locator;
  readonly customerField: Locator;
  readonly itemsTable: Locator;
  readonly addItemButton: Locator;
  readonly itemIsbnInput: Locator;
  readonly itemQtyInput: Locator;
  readonly itemPriceInput: Locator;
  readonly saveButton: Locator;
  readonly finalizeButton: Locator;
  readonly printButton: Locator;
  readonly viewButton: Locator;
  readonly deleteButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.locator('button:has-text("Create DR"), button:has-text("New Delivery Receipt")');
    this.drTable = page.locator('table:has(th:has-text("DR Number")), .dr-table');
    this.drRows = page.locator('tbody tr');
    this.searchInput = page.locator('input[placeholder*="earch" i], input[name="search"]');
    this.filterStatus = page.locator('select[name="status"], select[id*="status"]');
    this.customerSelect = page.locator('select[name="customerId"], select[id*="customer"]');
    this.dateFrom = page.locator('input[name="dateFrom"], input[placeholder*="From" i]');
    this.dateTo = page.locator('input[name="dateTo"], input[placeholder*="To" i]');
    this.modal = page.locator('[role="dialog"], .modal');
    this.form = page.locator('form:has(select[name="customerId"])');
    this.customerField = page.locator('select[name="customerId"]');
    this.itemsTable = page.locator('.items-table, table:has(th:has-text("ISBN"))');
    this.addItemButton = page.locator('button:has-text("Add Item"), button:has-text("Add Book")');
    this.itemIsbnInput = page.locator('input[name="isbn"], input[placeholder*="SBN" i]');
    this.itemQtyInput = page.locator('input[name="qty"], input[type="number"]');
    this.itemPriceInput = page.locator('input[name="price"], input[type="number"][step="0.01"]');
    this.saveButton = page.locator('button:has-text("Save"), button:has-text("Create")');
    this.finalizeButton = page.locator('button:has-text("Finalize")');
    this.printButton = page.locator('button:has-text("Print")');
    this.viewButton = page.locator('button:has-text("View"), a:has-text("View")');
    this.deleteButton = page.locator('button:has-text("Delete")');
    this.errorMessage = page.locator('.text-red-600, .text-red-500, [role="alert"]');
    this.successMessage = page.locator('.text-green-600, .text-green-500, .toast-success');
    this.pagination = page.locator('nav[aria-label="pagination"], .pagination');
  }

  async goto() {
    await this.page.goto('/delivery-receipts', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.drTable).toBeVisible({ timeout: 15000 });
  }

  async createDR(customerName: string, items: Array<{ isbn: string; qty: number; price: number }>) {
    await this.createButton.click();
    await expect(this.modal).toBeVisible({ timeout: 5000 });

    await this.customerField.selectOption({ label: customerName });

    for (const item of items) {
      await this.addItemButton.click();
      // Fill in the last added row
      const rows = await this.itemsTable.locator('tbody tr').all();
      const lastRow = rows[rows.length - 1];
      await lastRow.locator('input[name="isbn"]').fill(item.isbn);
      await lastRow.locator('input[name="qty"]').fill(item.qty.toString());
      await lastRow.locator('input[name="price"]').fill(item.price.toString());
    }

    await this.saveButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
    await expect(this.modal).not.toBeVisible({ timeout: 5000 });
  }

  async searchDR(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.waitForLoad();
  }

  async filterByStatus(status: string) {
    await this.filterStatus.selectOption(status);
    await this.waitForLoad();
  }

  async viewDR(drNumber: string) {
    await this.page.locator(`tr:has-text("${drNumber}")`).locator('button:has-text("View")').click();
    await expect(this.modal).toBeVisible({ timeout: 5000 });
  }

  async finalizeDR(drNumber: string) {
    await this.page.locator(`tr:has-text("${drNumber}")`).locator('button:has-text("Finalize")').click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async expectDRInTable(drNumber: string) {
    await expect(this.page.locator(`tr:has-text("${drNumber}")`)).toBeVisible({ timeout: 5000 });
  }

  async getDRCount(): Promise<number> {
    const rows = await this.drRows.all();
    return rows.length;
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