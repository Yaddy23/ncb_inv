import { Page, Locator, expect } from '@playwright/test';

export class EvaluationFormsPage {
  readonly page: Page;
  readonly table: Locator;
  readonly rows: Locator;
  readonly searchInput: Locator;
  readonly filterStatus: Locator;
  readonly filterExecutive: Locator;
  readonly createButton: Locator;
  readonly modal: Locator;
  readonly form: Locator;
  readonly executiveField: Locator;
  readonly periodStartField: Locator;
  readonly periodEndField: Locator;
  readonly visitsField: Locator;
  readonly callsField: Locator;
  readonly ordersField: Locator;
  readonly revenueField: Locator;
  readonly notesField: Locator;
  readonly saveButton: Locator;
  readonly submitButton: Locator;
  readonly viewButton: Locator;
  readonly printButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    this.page = page;
    this.table = page.locator('table:has(th:has-text("EF Number")), .ef-table');
    this.rows = page.locator('tbody tr');
    this.searchInput = page.locator('input[placeholder*="earch" i], input[name="search"]');
    this.filterStatus = page.locator('select[name="status"], select[id*="status"]');
    this.filterExecutive = page.locator('select[name="marketingExecutiveId"], select[id*="executive"]');
    this.createButton = page.locator('button:has-text("Create EF"), button:has-text("New Evaluation Form")');
    this.modal = page.locator('[role="dialog"], .modal');
    this.form = page.locator('form:has(select[name="marketingExecutiveId"])');
    this.executiveField = page.locator('select[name="marketingExecutiveId"]');
    this.periodStartField = page.locator('input[name="periodStart"], input[type="date"]');
    this.periodEndField = page.locator('input[name="periodEnd"], input[type="date"]');
    this.visitsField = page.locator('input[name="visits"], input[type="number"]');
    this.callsField = page.locator('input[name="calls"], input[type="number"]');
    this.ordersField = page.locator('input[name="orders"], input[type="number"]');
    this.revenueField = page.locator('input[name="revenue"], input[type="number"][step="0.01"]');
    this.notesField = page.locator('textarea[name="notes"]');
    this.saveButton = page.locator('button:has-text("Save"), button:has-text("Create")');
    this.submitButton = page.locator('button:has-text("Submit")');
    this.viewButton = page.locator('button:has-text("View"), a:has-text("View")');
    this.printButton = page.locator('button:has-text("Print")');
    this.errorMessage = page.locator('.text-red-600, .text-red-500, [role="alert"]');
    this.successMessage = page.locator('.text-green-600, .text-green-500, .toast-success');
    this.pagination = page.locator('nav[aria-label="pagination"], .pagination');
  }

  async goto() {
    await this.page.goto('/evaluation-forms', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.table).toBeVisible({ timeout: 15000 });
  }

  async createEF(executiveName: string, data: {
    periodStart: string;
    periodEnd: string;
    visits: number;
    calls: number;
    orders: number;
    revenue: number;
    notes?: string;
  }) {
    await this.createButton.click();
    await expect(this.modal).toBeVisible({ timeout: 5000 });

    await this.executiveField.selectOption({ label: executiveName });
    await this.periodStartField.fill(data.periodStart);
    await this.periodEndField.fill(data.periodEnd);
    await this.visitsField.fill(data.visits.toString());
    await this.callsField.fill(data.calls.toString());
    await this.ordersField.fill(data.orders.toString());
    await this.revenueField.fill(data.revenue.toString());

    if (data.notes) {
      await this.notesField.fill(data.notes);
    }

    await this.saveButton.click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
    await expect(this.modal).not.toBeVisible({ timeout: 5000 });
  }

  async searchEF(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.waitForLoad();
  }

  async filterByStatus(status: string) {
    await this.filterStatus.selectOption(status);
    await this.waitForLoad();
  }

  async viewEF(efNumber: string) {
    await this.page.locator(`tr:has-text("${efNumber}")`).locator('button:has-text("View")').click();
    await expect(this.modal).toBeVisible({ timeout: 5000 });
  }

  async submitEF(efNumber: string) {
    await this.page.locator(`tr:has-text("${efNumber}")`).locator('button:has-text("Submit")').click();
    await expect(this.successMessage).toBeVisible({ timeout: 10000 });
  }

  async expectEFInTable(efNumber: string) {
    await expect(this.page.locator(`tr:has-text("${efNumber}")`)).toBeVisible({ timeout: 5000 });
  }

  async getEFCount(): Promise<number> {
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