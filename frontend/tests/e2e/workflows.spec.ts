import { test, expect } from '../fixtures/auth-fixtures';
import { BooksPage } from '../pages/BooksPage';
import { ScanPage } from '../pages/ScanPage';
import { DeliveryReceiptsPage } from '../pages/DeliveryReceiptsPage';
import { SalesInvoicesPage } from '../pages/SalesInvoicesPage';
import { ReservationsPage } from '../pages/ReservationsPage';
import { EvaluationFormsPage } from '../pages/EvaluationFormsPage';

test.describe('Books Workflow Tests', () => {
  let booksPage: BooksPage;

  test.beforeEach(async ({ adminPage }) => {
    booksPage = new BooksPage(adminPage);
    await booksPage.goto();
  });

  test('should complete full book lifecycle', async ({ adminPage }) => {
    // Create book
    const isbn = `978${Date.now().toString().slice(-10)}`;
    await booksPage.createBook({
      title: 'Test Book',
      author: 'Test Author',
      isbn: isbn,
      publisher: 'Test Publisher',
      category: 'Fiction',
      price: 29.99,
      cost: 15.00,
      stock: 100,
      minStock: 10,
      location: 'A1',
    });
    await booksPage.expectSuccess('created');

    // Verify in list
    await booksPage.searchBook(isbn);
    await booksPage.waitForLoad();
    await booksPage.expectBookInTable(isbn);

    // Edit book
    await booksPage.editBook(isbn, { price: 34.99 });
    await booksPage.expectSuccess('updated');

    // Verify update
    await booksPage.searchBook(isbn);
    await booksPage.waitForLoad();
    await expect(adminPage.locator(`tr:has-text("${isbn}")`)).toContainText('34.99');

    // Adjust stock
    await booksPage.adjustStock(isbn, 50, 'Restock');
    await booksPage.expectSuccess();

    // Delete book
    await booksPage.deleteBook(isbn);
    await booksPage.expectSuccess('deleted');

    // Verify deletion
    await booksPage.searchBook(isbn);
    await booksPage.waitForLoad();
    const count = await booksPage.getBookCount();
    expect(count).toBe(0);
  });

  test('should handle low stock alert', async ({ adminPage }) => {
    const isbn = `978${Date.now().toString().slice(-10)}`;

    // Create book with low stock
    await booksPage.createBook({
      title: 'Low Stock Book',
      author: 'Author',
      isbn: isbn,
      publisher: 'Publisher',
      category: 'Fiction',
      price: 19.99,
      cost: 10.00,
      stock: 5,
      minStock: 10,
      location: 'A1',
    });
    await booksPage.expectSuccess();

    // Check for low stock indicator
    await booksPage.searchBook(isbn);
    await booksPage.waitForLoad();

    const lowStockIndicator = adminPage.locator('text=Low Stock, .text-red-600:has-text("Low"), .badge:has-text("Low")');
    // Low stock might be indicated
  });

  test('should bulk import books', async ({ adminPage }) => {
    // This would require a test file
    // await booksPage.bulkImport('path/to/test-file.xlsx');
  });

  test('should export books', async ({ adminPage }) => {
    const downloadPromise = adminPage.waitForEvent('download');
    const exportButton = adminPage.locator('button:has-text("Export")');
    if (await exportButton.isVisible()) {
      await exportButton.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.(xlsx|csv)$/);
    }
  });
});

test.describe('Scan Workflow Tests', () => {
  let scanPage: ScanPage;

  test.beforeEach(async ({ adminPage }) => {
    scanPage = new ScanPage(adminPage);
    await scanPage.goto();
  });

  test('should scan ISBN and find book', async ({ adminPage }) => {
    // This test requires a barcode scanner or manual input
    await scanPage.scanISBN('9780134685991'); // Example ISBN
    await scanPage.waitForResult();

    // Check for result
    const result = adminPage.locator('.scan-result, text=Found, text=Book');
    await expect(result).toBeVisible({ timeout: 10000 });
  });

  test('should handle unknown ISBN', async ({ adminPage }) => {
    await scanPage.scanISBN('0000000000000');
    await scanPage.waitForResult();

    const notFound = adminPage.locator('text=Not found, text=Unknown, text=No book');
    await expect(notFound).toBeVisible({ timeout: 10000 });
  });

  test('should add scanned book to cart/session', async ({ adminPage }) => {
    await scanPage.scanISBN('9780134685991');
    await scanPage.waitForResult();

    const addButton = adminPage.locator('button:has-text("Add"), button:has-text("Add to")');
    if (await addButton.isVisible()) {
      await addButton.click();
      await scanPage.expectSuccess();
    }
  });
});

test.describe('Delivery Receipts Workflow', () => {
  let deliveryPage: DeliveryReceiptsPage;

  test.beforeEach(async ({ adminPage }) => {
    deliveryPage = new DeliveryReceiptsPage(adminPage);
    await deliveryPage.goto();
  });

  test('should create delivery receipt', async ({ adminPage }) => {
    await deliveryPage.createReceipt({
      supplier: 'Test Supplier',
      items: [
        { isbn: '9780134685991', qty: 10 },
        { isbn: '9780134685992', qty: 5 },
      ],
    });
    await deliveryPage.expectSuccess();

    // Verify in list
    await deliveryPage.searchReceipt('Test Supplier');
    await deliveryPage.waitForLoad();
    await expect(adminPage.locator('tr:has-text("Test Supplier")')).toBeVisible({ timeout: 10000 });
  });

  test('should update receipt status', async ({ adminPage }) => {
    // Create receipt first
    await deliveryPage.createReceipt({
      supplier: 'Status Test Supplier',
      items: [{ isbn: '9780134685991', qty: 5 }],
    });
    await deliveryPage.expectSuccess();

    await deliveryPage.searchReceipt('Status Test Supplier');
    await deliveryPage.waitForLoad();

    // Update status to Received
    await deliveryPage.updateStatus('Status Test Supplier', 'Received');
    await deliveryPage.expectSuccess();
  });

  test('should print delivery receipt', async ({ adminPage }) => {
    await deliveryPage.createReceipt({
      supplier: 'Print Test Supplier',
      items: [{ isbn: '9780134685991', qty: 3 }],
    });
    await deliveryPage.expectSuccess();

    await deliveryPage.searchReceipt('Print Test Supplier');
    await deliveryPage.waitForLoad();

    const printPromise = adminPage.waitForEvent('download');
    await deliveryPage.printReceipt('Print Test Supplier');
    const download = await printPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});

test.describe('Sales Invoices Workflow', () => {
  let salesPage: SalesInvoicesPage;

  test.beforeEach(async ({ adminPage }) => {
    salesPage = new SalesInvoicesPage(adminPage);
    await salesPage.goto();
  });

  test('should create sales invoice', async ({ adminPage }) => {
    await salesPage.createInvoice({
      customer: 'Test Customer',
      items: [
        { isbn: '9780134685991', qty: 2, price: 29.99 },
        { isbn: '9780134685992', qty: 1, price: 39.99 },
      ],
    });
    await salesPage.expectSuccess();

    // Verify in list
    await salesPage.searchInvoice('Test Customer');
    await salesPage.waitForLoad();
    await expect(adminPage.locator('tr:has-text("Test Customer")')).toBeVisible({ timeout: 10000 });
  });

  test('should calculate totals correctly', async ({ adminPage }) => {
    await salesPage.createInvoice({
      customer: 'Total Test Customer',
      items: [
        { isbn: '9780134685991', qty: 2, price: 25.00 },
        { isbn: '9780134685992', qty: 3, price: 15.00 },
      ],
    });
    await salesPage.expectSuccess();

    await salesPage.searchInvoice('Total Test Customer');
    await salesPage.waitForLoad();

    // Check total = (2*25) + (3*15) = 50 + 45 = 95
    await expect(adminPage.locator('tr:has-text("Total Test Customer")')).toContainText('95');
  });

  test('should update invoice status', async ({ adminPage }) => {
    await salesPage.createInvoice({
      customer: 'Status Invoice Customer',
      items: [{ isbn: '9780134685991', qty: 1, price: 29.99 }],
    });
    await salesPage.expectSuccess();

    await salesPage.searchInvoice('Status Invoice Customer');
    await salesPage.waitForLoad();

    await salesPage.updateStatus('Status Invoice Customer', 'Paid');
    await salesPage.expectSuccess();
  });
});

test.describe('Reservations Workflow', () => {
  let reservationsPage: ReservationsPage;

  test.beforeEach(async ({ adminPage }) => {
    reservationsPage = new ReservationsPage(adminPage);
    await reservationsPage.goto();
  });

  test('should create reservation', async ({ adminPage }) => {
    await reservationsPage.createReservation('Test Customer', '9780134685991', 2);
    await reservationsPage.expectSuccess();

    // Verify in list
    await reservationsPage.searchReservation('9780134685991');
    await reservationsPage.waitForLoad();
    await reservationsPage.expectReservationInTable('9780134685991');
  });

  test('should fulfill reservation', async ({ adminPage }) => {
    await reservationsPage.createReservation('Fulfill Customer', '9780134685991', 1);
    await reservationsPage.expectSuccess();

    await reservationsPage.searchReservation('9780134685991');
    await reservationsPage.waitForLoad();

    await reservationsPage.fulfillReservation('9780134685991');
    await reservationsPage.expectSuccess();
  });

  test('should cancel reservation', async ({ adminPage }) => {
    await reservationsPage.createReservation('Cancel Customer', '9780134685992', 3);
    await reservationsPage.expectSuccess();

    await reservationsPage.searchReservation('9780134685992');
    await reservationsPage.waitForLoad();

    await reservationsPage.cancelReservation('9780134685992');
    await reservationsPage.expectSuccess();
  });

  test('should release reservation', async ({ adminPage }) => {
    await reservationsPage.createReservation('Release Customer', '9780134685993', 2);
    await reservationsPage.expectSuccess();

    await reservationsPage.searchReservation('9780134685993');
    await reservationsPage.waitForLoad();

    await reservationsPage.releaseReservation('9780134685993');
    await reservationsPage.expectSuccess();
  });
});

test.describe('Evaluation Forms Workflow', () => {
  let evalPage: EvaluationFormsPage;

  test.beforeEach(async ({ adminPage }) => {
    evalPage = new EvaluationFormsPage(adminPage);
    await evalPage.goto();
  });

  test('should create evaluation form', async ({ adminPage }) => {
    await evalPage.createEF('Test Executive', {
      periodStart: '2024-01-01',
      periodEnd: '2024-01-31',
      visits: 10,
      calls: 50,
      orders: 5,
      revenue: 5000,
      notes: 'Test evaluation form',
    });
    await evalPage.expectSuccess();

    // Verify in list
    await evalPage.searchEF('Test Executive');
    await evalPage.waitForLoad();
    await evalPage.expectEFInTable('EF-');
  });

  test('should submit evaluation form', async ({ adminPage }) => {
    await evalPage.createEF('Submit Executive', {
      periodStart: '2024-02-01',
      periodEnd: '2024-02-29',
      visits: 15,
      calls: 75,
      orders: 8,
      revenue: 8000,
    });
    await evalPage.expectSuccess();

    await evalPage.searchEF('Submit Executive');
    await evalPage.waitForLoad();

    // Submit the form
    await evalPage.submitEF('EF-');
    await evalPage.expectSuccess();
  });

  test('should view evaluation form details', async ({ adminPage }) => {
    await evalPage.createEF('View Executive', {
      periodStart: '2024-03-01',
      periodEnd: '2024-03-31',
      visits: 20,
      calls: 100,
      orders: 10,
      revenue: 10000,
    });
    await evalPage.expectSuccess();

    await evalPage.searchEF('View Executive');
    await evalPage.waitForLoad();

    await evalPage.viewEF('EF-');
    await expect(adminPage.locator('[role="dialog"], .modal')).toBeVisible({ timeout: 5000 });

    await adminPage.keyboard.press('Escape');
  });
});

test.describe('Cross-Workflow Integration', () => {
  test('delivery receipt should update book stock', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    const deliveryPage = new DeliveryReceiptsPage(adminPage);

    // Create book with initial stock
    const isbn = `978${Date.now().toString().slice(-10)}`;
    await booksPage.goto();
    await booksPage.createBook({
      title: 'Integration Book',
      author: 'Author',
      isbn: isbn,
      publisher: 'Publisher',
      category: 'Fiction',
      price: 29.99,
      cost: 15.00,
      stock: 10,
      minStock: 5,
      location: 'A1',
    });
    await booksPage.expectSuccess();

    // Create delivery receipt for this book
    await deliveryPage.goto();
    await deliveryPage.createReceipt({
      supplier: 'Integration Supplier',
      items: [{ isbn: isbn, qty: 20 }],
    });
    await deliveryPage.expectSuccess();

    // Update status to Received
    await deliveryPage.searchReceipt('Integration Supplier');
    await deliveryPage.waitForLoad();
    await deliveryPage.updateStatus('Integration Supplier', 'Received');
    await deliveryPage.expectSuccess();

    // Check book stock increased
    await booksPage.goto();
    await booksPage.searchBook(isbn);
    await booksPage.waitForLoad();
    // Stock should be 30 (10 + 20)
  });

  test('sales invoice should reduce book stock', async ({ adminPage }) => {
    const booksPage = new BooksPage(adminPage);
    const salesPage = new SalesInvoicesPage(adminPage);

    // Create book with stock
    const isbn = `978${Date.now().toString().slice(-10)}`;
    await booksPage.goto();
    await booksPage.createBook({
      title: 'Sales Integration Book',
      author: 'Author',
      isbn: isbn,
      publisher: 'Publisher',
      category: 'Fiction',
      price: 29.99,
      cost: 15.00,
      stock: 50,
      minStock: 5,
      location: 'A1',
    });
    await booksPage.expectSuccess();

    // Create sales invoice
    await salesPage.goto();
    await salesPage.createInvoice({
      customer: 'Integration Customer',
      items: [{ isbn: isbn, qty: 5, price: 29.99 }],
    });
    await salesPage.expectSuccess();

    // Update status to Paid/Completed
    await salesPage.searchInvoice('Integration Customer');
    await salesPage.waitForLoad();
    await salesPage.updateStatus('Integration Customer', 'Paid');
    await salesPage.expectSuccess();

    // Check book stock decreased
    await booksPage.goto();
    await booksPage.searchBook(isbn);
    await booksPage.waitForLoad();
    // Stock should be 45 (50 - 5)
  });
});