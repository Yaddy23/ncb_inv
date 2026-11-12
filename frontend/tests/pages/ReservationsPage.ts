import { Page, Locator, expect } from '@playwright/test';

export class ReservationsPage {
  readonly page: Page;
  readonly table: Locator;
  readonly rows: Locator;
  readonly searchInput: Locator;
  readonly filterStatus: Locator;
  readonly filterCustomer: Locator;
  readonly createButton: Locator;
  readonly modal: Locator;
  readonly form: Locator;
  readonly customerField: Locator;
  readonly isbnField: Locator;
  readonly qtyField: Locator;
  readonly notesField: Locator;
  readonly saveButton: Locator;
  readonly fulfillButton: Locator;
  readonly cancelButton: Locator;
  readonly releaseButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    this.page = page;
    this.table = page.locator('table:has(th:has-text("ISBN")), .reservations-table');
    this.rows = page.locator('tbody tr');
    this.searchInput = page.locator('input[placeholder*="earch" i], input[name="search"]');
    this.filterStatus = page.locator('select[name="status"], select[id*="status"]');
    this.filterCustomer = page.locator('select[name="customerId"], select[id*="customer"]');
    this.createButton = page.locator('button:has-text("Create Reservation"), button:has-text("New Reservation")');
    this.modal = page.locator('[role="dialog"], .modal');
    this.form = page.locator('form:has(select[name="customerId"])');
    this.customerField = page.locator('select[name="customerId"]');
    this.isbnField = page.locator('input[name="isbn"], input[placeholder*="SBN" i]');
    this.qtyField = page.locator('input[name="qty"], input[type="number"]');
    this.notesField = page.locator('textarea[name="notes"], input[name="notes"]');
    this.saveButton = page.locator('button:has-text("Save"), button:has-text("Create")');
    this.fulfillButton = page.locator('button:has-text("Fulfill")');
    this.cancelButton = page.locator('button:has-text("Cancel")');
    this.releaseButton = page.locator('button:has-text("Release")');
    this.errorMessage = page.locator('.text-red-600, .text-red-500, [role="alert"]');
    this.successMessage = page.locator('.text-green-600, .text-green-500, .toast-success');
    this.pagination = page.locator('nav[aria-label="pagination"], .pagination');
  }

  async goto() {
    await this.page.goto('/reservations', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.table).toBeVisible({ timeout: 15000 });
  }

  async createReservation(customerName: string, isbn: string, qty: number) {
    await this.createButton.click();
    await expect(this.modal).toBeVisible({ timeout: 5000 });

    await this.customerField.selectOption({ label: customerName });
    await this.isbnField.fill(isbn);
    await this.qtyField.fill(qty.toString());

    await this.saveButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
    await expect(this.modal).not.toBeVisible({ timeout: 5000 });
  }

  async searchReservation(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.waitForLoad();
  }

  async filterByStatus(status: string) {
    await this.filterStatus.selectOption(status);
    await this.waitForLoad();
  }

  async fulfillReservation(isbn: string) {
    await this.page.locator(`tr:has-text("${isbn}")`).locator('button:has-text("Fulfill")').click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async cancelReservation(isbn: string) {
    await this.page.locator(`tr:has-text("${isbn}")`).locator('button:has-text("Cancel")').click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async releaseReservation(isbn: string) {
    await this.page.locator(`tr:has-text("${isbn}")`).locator('button:has-text("Release")').click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async expectReservationInTable(isbn: string) {
    await expect(this.page.locator(`tr:has-text("${isbn}")`)).toBeVisible({ timeout: 5000 });
  }

  async getReservationCount(): Promise<number> {
    const rows = await this.rows.all();
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