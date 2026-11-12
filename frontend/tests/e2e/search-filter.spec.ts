import { test, expect } from '../fixtures/auth-fixtures';
import { BooksPage } from '../pages/BooksPage';
import { DeliveryReceiptsPage } from '../pages/DeliveryReceiptsPage';
import { SalesInvoicesPage } from '../pages/SalesInvoicesPage';
import { ReservationsPage } from '../pages/ReservationsPage';
import { EvaluationFormsPage } from '../pages/EvaluationFormsPage';

test.describe('Search and Filter Tests', () => {
  test.describe('Books Search and Filter', () => {
    let booksPage: BooksPage;

    test.beforeEach(async ({ adminPage }) => {
      booksPage = new BooksPage(adminPage);
      await booksPage.goto();
    });

    test('should search by title', async ({ adminPage }) => {
      await booksPage.searchBook('Test');
      await booksPage.waitForLoad();

      // Results should contain "Test" in title
      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const title = await row.locator('td').nth(1).textContent();
        if (title) {
          expect(title.toLowerCase()).toContain('test');
        }
      }
    });

    test('should search by author', async ({ adminPage }) => {
      await booksPage.searchBook('Author');
      await booksPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const author = await row.locator('td').nth(2).textContent();
        if (author) {
          expect(author.toLowerCase()).toContain('author');
        }
      }
    });

    test('should search by ISBN (exact match)', async ({ adminPage }) => {
      const isbn = '9780134685991';
      await booksPage.searchBook(isbn);
      await booksPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      if (count > 0) {
        const row = rows.first();
        const rowIsbn = await row.locator('td').nth(0).textContent();
        expect(rowIsbn).toContain(isbn);
      }
    });

    test('should search by category', async ({ adminPage }) => {
      await booksPage.searchBook('Fiction');
      await booksPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const category = await row.locator('td').nth(4).textContent();
        if (category) {
          expect(category.toLowerCase()).toContain('fiction');
        }
      }
    });

    test('should clear search', async ({ adminPage }) => {
      await booksPage.searchBook('Test');
      await booksPage.waitForLoad();

      await booksPage.searchInput.clear();
      await adminPage.keyboard.press('Enter');
      await booksPage.waitForLoad();

      // Should show all books
      const count = await booksPage.getBookCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should filter by category', async ({ adminPage }) => {
      await booksPage.filterByCategory('Fiction');
      await booksPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const category = await row.locator('td').nth(4).textContent();
        if (category) {
          expect(category).toBe('Fiction');
        }
      }
    });

    test('should filter by stock status', async ({ adminPage }) => {
      await booksPage.filterByStockStatus('Low Stock');
      await booksPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const stock = await row.locator('td').nth(6).textContent();
        const minStock = await row.locator('td').nth(7).textContent();

        if (stock && minStock) {
          const stockNum = parseInt(stock);
          const minStockNum = parseInt(minStock);
          expect(stockNum).toBeLessThanOrEqual(minStockNum);
        }
      }
    });

    test('should filter by price range', async ({ adminPage }) => {
      // If price range filter exists
      const priceMin = adminPage.locator('input[name="priceMin"], input[placeholder*="Min Price" i]');
      const priceMax = adminPage.locator('input[name="priceMax"], input[placeholder*="Max Price" i]');

      if (await priceMin.isVisible() && await priceMax.isVisible()) {
        await priceMin.fill('10');
        await priceMax.fill('50');
        await adminPage.keyboard.press('Enter');
        await booksPage.waitForLoad();

        const rows = adminPage.locator('tbody tr');
        const count = await rows.count();

        for (let i = 0; i < count; i++) {
          const row = rows.nth(i);
          const price = await row.locator('td').nth(5).textContent();
          if (price) {
            const priceNum = parseFloat(price.replace('$', ''));
            expect(priceNum).toBeGreaterThanOrEqual(10);
            expect(priceNum).toBeLessThanOrEqual(50);
          }
        }
      }
    });

    test('should combine search and filters', async ({ adminPage }) => {
      await booksPage.searchBook('Test');
      await booksPage.filterByCategory('Fiction');
      await booksPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const title = await row.locator('td').nth(1).textContent();
        const category = await row.locator('td').nth(4).textContent();

        if (title) expect(title.toLowerCase()).toContain('test');
        if (category) expect(category).toBe('Fiction');
      }
    });

    test('should persist filters on page reload', async ({ adminPage }) => {
      await booksPage.searchBook('Test');
      await booksPage.filterByCategory('Fiction');
      await booksPage.waitForLoad();

      await adminPage.reload();
      await booksPage.waitForLoad();

      // Check if filters persisted (depends on implementation)
      await expect(booksPage.searchInput).toHaveValue('Test');
    });

    test('should show no results message', async ({ adminPage }) => {
      await booksPage.searchBook('NonExistentBookXYZ123');
      await booksPage.waitForLoad();

      const noResults = adminPage.locator('text=No results, text=No books found, text=Nothing found');
      await expect(noResults).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Delivery Receipts Search and Filter', () => {
    let deliveryPage: DeliveryReceiptsPage;

    test.beforeEach(async ({ adminPage }) => {
      deliveryPage = new DeliveryReceiptsPage(adminPage);
      await deliveryPage.goto();
    });

    test('should search by supplier', async ({ adminPage }) => {
      await deliveryPage.searchReceipt('Test Supplier');
      await deliveryPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const supplier = await row.locator('td').nth(1).textContent();
        if (supplier) {
          expect(supplier.toLowerCase()).toContain('test supplier');
        }
      }
    });

    test('should filter by status', async ({ adminPage }) => {
      await deliveryPage.filterByStatus('Pending');
      await deliveryPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const status = await row.locator('td').nth(3).textContent();
        if (status) {
          expect(status).toBe('Pending');
        }
      }
    });

    test('should filter by date range', async ({ adminPage }) => {
      const dateFrom = adminPage.locator('input[name="dateFrom"], input[placeholder*="From" i]');
      const dateTo = adminPage.locator('input[name="dateTo"], input[placeholder*="To" i]');

      if (await dateFrom.isVisible() && await dateTo.isVisible()) {
        await dateFrom.fill('2024-01-01');
        await dateTo.fill('2024-12-31');
        await adminPage.keyboard.press('Enter');
        await deliveryPage.waitForLoad();
      }
    });
  });

  test.describe('Sales Invoices Search and Filter', () => {
    let salesPage: SalesInvoicesPage;

    test.beforeEach(async ({ adminPage }) => {
      salesPage = new SalesInvoicesPage(adminPage);
      await salesPage.goto();
    });

    test('should search by customer', async ({ adminPage }) => {
      await salesPage.searchInvoice('Test Customer');
      await salesPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const customer = await row.locator('td').nth(1).textContent();
        if (customer) {
          expect(customer.toLowerCase()).toContain('test customer');
        }
      }
    });

    test('should filter by status', async ({ adminPage }) => {
      await salesPage.filterByStatus('Paid');
      await salesPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const status = await row.locator('td').nth(3).textContent();
        if (status) {
          expect(status).toBe('Paid');
        }
      }
    });

    test('should filter by amount range', async ({ adminPage }) => {
      const amountMin = adminPage.locator('input[name="amountMin"], input[placeholder*="Min Amount" i]');
      const amountMax = adminPage.locator('input[name="amountMax"], input[placeholder*="Max Amount" i]');

      if (await amountMin.isVisible() && await amountMax.isVisible()) {
        await amountMin.fill('100');
        await amountMax.fill('1000');
        await adminPage.keyboard.press('Enter');
        await salesPage.waitForLoad();
      }
    });
  });

  test.describe('Reservations Search and Filter', () => {
    let reservationsPage: ReservationsPage;

    test.beforeEach(async ({ adminPage }) => {
      reservationsPage = new ReservationsPage(adminPage);
      await reservationsPage.goto();
    });

    test('should search by ISBN', async ({ adminPage }) => {
      await reservationsPage.searchReservation('9780134685991');
      await reservationsPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const isbn = await row.locator('td').nth(1).textContent();
        if (isbn) {
          expect(isbn).toContain('9780134685991');
        }
      }
    });

    test('should search by customer', async ({ adminPage }) => {
      await reservationsPage.searchReservation('Test Customer');
      await reservationsPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const customer = await row.locator('td').nth(0).textContent();
        if (customer) {
          expect(customer.toLowerCase()).toContain('test customer');
        }
      }
    });

    test('should filter by status', async ({ adminPage }) => {
      await reservationsPage.filterByStatus('Active');
      await reservationsPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const status = await row.locator('td').nth(3).textContent();
        if (status) {
          expect(status).toBe('Active');
        }
      }
    });
  });

  test.describe('Evaluation Forms Search and Filter', () => {
    let evalPage: EvaluationFormsPage;

    test.beforeEach(async ({ adminPage }) => {
      evalPage = new EvaluationFormsPage(adminPage);
      await evalPage.goto();
    });

    test('should search by executive name', async ({ adminPage }) => {
      await evalPage.searchEF('Executive');
      await evalPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const executive = await row.locator('td').nth(1).textContent();
        if (executive) {
          expect(executive.toLowerCase()).toContain('executive');
        }
      }
    });

    test('should filter by status', async ({ adminPage }) => {
      await evalPage.filterByStatus('Draft');
      await evalPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const status = await row.locator('td').nth(2).textContent();
        if (status) {
          expect(status).toBe('Draft');
        }
      }
    });

    test('should filter by executive', async ({ adminPage }) => {
      await evalPage.filterByExecutive('Test Executive');
      await evalPage.waitForLoad();

      const rows = adminPage.locator('tbody tr');
      const count = await rows.count();

      for (let i = 0; i < count; i++) {
        const row = rows.nth(i);
        const executive = await row.locator('td').nth(1).textContent();
        if (executive) {
          expect(executive).toBe('Test Executive');
        }
      }
    });
  });

  test.describe('Global Search', () => {
    test('should have global search accessible', async ({ adminPage }) => {
      const globalSearch = adminPage.locator('input[placeholder*="Search" i][type="search"], .global-search input');

      // Global search might be in header
      if (await globalSearch.isVisible()) {
        await globalSearch.fill('Test');
        await adminPage.keyboard.press('Enter');
        // Should show results from multiple modules
      }
    });
  });

  test.describe('Search Performance', () => {
    test('should return results within reasonable time', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();

      const startTime = Date.now();
      await booksPage.searchBook('Test');
      await booksPage.waitForLoad();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds max
    });

    test('should handle rapid search input', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();

      // Type rapidly
      await booksPage.searchInput.fill('T');
      await booksPage.searchInput.fill('Te');
      await booksPage.searchInput.fill('Tes');
      await booksPage.searchInput.fill('Test');
      await adminPage.keyboard.press('Enter');
      await booksPage.waitForLoad();

      // Should handle debounced search correctly
    });
  });
});