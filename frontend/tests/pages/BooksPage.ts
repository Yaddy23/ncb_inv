import { Page, Locator, expect } from '@playwright/test';

export class BooksPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly clearSearchButton: Locator;
  readonly subjectFilter: Locator;
  readonly publisherFilter: Locator;
  readonly yearFilter: Locator;
  readonly stockFilter: Locator;
  readonly minPriceInput: Locator;
  readonly maxPriceInput: Locator;
  readonly sortBySelect: Locator;
  readonly sortOrderButton: Locator;
  readonly limitSelect: Locator;
  readonly table: Locator;
  readonly tableRows: Locator;
  readonly pagination: Locator;
  readonly addBookButton: Locator;
  readonly createButton: Locator;
  readonly exportButton: Locator;
  readonly importButton: Locator;
  readonly loadingSpinner: Locator;
  readonly emptyState: Locator;
  readonly archivedCheckbox: Locator;

  // Modal elements
  readonly modal: Locator;
  readonly isbnField: Locator;
  readonly titleField: Locator;
  readonly authorField: Locator;
  readonly publisherField: Locator;
  readonly categoryField: Locator;
  readonly editionField: Locator;
  readonly yearField: Locator;
  readonly bindField: Locator;
  readonly priceField: Locator;
  readonly costField: Locator;
  readonly stockField: Locator;
  readonly minStockField: Locator;
  readonly locationField: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.locator('input[placeholder*="earch" i], input[name="search"]');
    this.searchButton = page.locator('button:has-text("Search"), button[type="submit"]');
    this.clearSearchButton = page.locator('button:has-text("Clear"), button:has-text("Reset")');
    this.subjectFilter = page.locator('select[name="subject"], select[id*="subject"]');
    this.publisherFilter = page.locator('select[name="publisher"], select[id*="publisher"]');
    this.yearFilter = page.locator('select[name="year"], select[id*="year"]');
    this.stockFilter = page.locator('select[name="stock"], select[id*="stock"]');
    this.minPriceInput = page.locator('input[name="minPrice"], input[placeholder*="in" i]');
    this.maxPriceInput = page.locator('input[name="maxPrice"], input[placeholder*="ax" i]');
    this.sortBySelect = page.locator('select[name="sortBy"], select[id*="sort"]');
    this.sortOrderButton = page.locator('button[aria-label*="ort" i]');
    this.limitSelect = page.locator('select[name="limit"], select[id*="limit"]');
    this.table = page.locator('table');
    this.tableRows = page.locator('tbody tr');
    this.pagination = page.locator('nav[aria-label="pagination"], .pagination');
    this.addBookButton = page.locator('button:has-text("Add Book"), a:has-text("Add Book"), button:has-text("Create"), a:has-text("Create")');
    this.createButton = this.addBookButton; // Alias for backward compatibility
    this.exportButton = page.locator('button:has-text("Export")');
    this.importButton = page.locator('button:has-text("Import")');
    this.loadingSpinner = page.locator('.animate-spin, [role="status"]');
    this.emptyState = page.locator('text=No books found, text=No results');
    this.archivedCheckbox = page.locator('input[type="checkbox"][name="archived"], label:has-text("Archived") input');

    // Modal elements
    this.modal = page.locator('[role="dialog"], .modal, .modal-overlay');
    this.isbnField = page.locator('input[name="isbn"], input[name="ISBN"], input[placeholder*="SBN" i]');
    this.titleField = page.locator('input[name="title"], input[name="TITLE"], input[placeholder*="itle" i]');
    this.authorField = page.locator('input[name="author"], input[name="AUTHOR"], input[placeholder*="uthor" i]');
    this.publisherField = page.locator('input[name="publisher"], input[name="PUBLISHER"], input[placeholder*="ublisher" i]');
    this.categoryField = page.locator('select[name="subject"], select[name="category"], select[id*="subject"], select[id*="category"]');
    this.editionField = page.locator('input[name="edition"], input[name="EDITION"], input[placeholder*="dition" i]');
    this.yearField = page.locator('input[name="year"], input[name="YEAR"], input[placeholder*="ear" i]');
    this.bindField = page.locator('input[name="bind"], input[name="BIND"], input[placeholder*="ind" i]');
    this.priceField = page.locator('input[name="price"], input[name="PRICE"], input[placeholder*="rice" i]');
    this.costField = page.locator('input[name="cost"], input[name="COST"], input[placeholder*="ost" i]');
    this.stockField = page.locator('input[name="stock"], input[name="QTY"], input[name="qty"], input[placeholder*="tock" i]');
    this.minStockField = page.locator('input[name="minStock"], input[name="MIN_QTY"], input[placeholder*="in " i]');
    this.locationField = page.locator('input[name="location"], input[placeholder*="ocation" i]');
    this.saveButton = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]');
    this.cancelButton = page.locator('button:has-text("Cancel"), button:has-text("Close")');
  }

  async goto() {
    await this.page.goto('/books', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    await expect(this.table).toBeVisible({ timeout: 15000 });
    // Wait for loading to complete
    await expect(this.loadingSpinner).not.toBeVisible({ timeout: 10000 });
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.searchButton.click();
    await this.waitForLoad();
  }

  async clearSearch() {
    await this.clearSearchButton.click();
    await this.waitForLoad();
  }

  async filterBySubject(subject: string) {
    await this.subjectFilter.selectOption(subject);
    await this.waitForLoad();
  }

  async filterByPublisher(publisher: string) {
    await this.publisherFilter.selectOption(publisher);
    await this.waitForLoad();
  }

  async filterByYear(year: string) {
    await this.yearFilter.selectOption(year);
    await this.waitForLoad();
  }

  async filterByStock(stock: 'in' | 'out' | 'low') {
    await this.stockFilter.selectOption(stock);
    await this.waitForLoad();
  }

  async setPriceRange(min: number, max: number) {
    await this.minPriceInput.fill(min.toString());
    await this.maxPriceInput.fill(max.toString());
    await this.searchButton.click();
    await this.waitForLoad();
  }

  async sortBy(field: string, order: 'asc' | 'desc' = 'desc') {
    await this.sortBySelect.selectOption(field);
    // Check current order and click if needed
    const currentOrder = await this.sortOrderButton.getAttribute('aria-label');
    if ((order === 'asc' && currentOrder?.includes('desc')) ||
        (order === 'desc' && currentOrder?.includes('asc'))) {
      await this.sortOrderButton.click();
    }
    await this.waitForLoad();
  }

  async setLimit(limit: number) {
    await this.limitSelect.selectOption(limit.toString());
    await this.waitForLoad();
  }

  async getRowCount(): Promise<number> {
    return await this.tableRows.count();
  }

  async getFirstRowData(): Promise<Record<string, string>> {
    const firstRow = this.tableRows.first();
    const cells = await firstRow.locator('td').all();
    const headers = await this.table.locator('th').allTextContents();

    const data: Record<string, string> = {};
    for (let i = 0; i < cells.length && i < headers.length; i++) {
      data[headers[i]] = await cells[i].textContent() || '';
    }

    return data;
  }

  async clickRowAction(isbn: string, action: 'edit' | 'delete' | 'view') {
    const row = this.page.locator(`tr:has-text("${isbn}")`);
    await row.locator(`button:has-text("${action}"), a:has-text("${action}")`).click();
  }

  async expectBookInTable(isbn: string) {
    await expect(this.page.locator(`tr:has-text("${isbn}")`)).toBeVisible({ timeout: 10000 });
  }

  async expectBookNotInTable(isbn: string) {
    await expect(this.page.locator(`tr:has-text("${isbn}")`)).not.toBeVisible({ timeout: 5000 });
  }

  async goToPage(pageNum: number) {
    await this.page.click(`nav[aria-label="pagination"] button:has-text("${pageNum}")`);
    await this.waitForLoad();
  }

  async expectPaginationVisible() {
    await expect(this.pagination).toBeVisible({ timeout: 5000 });
  }
}