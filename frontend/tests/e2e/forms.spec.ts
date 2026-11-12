import { test, expect } from '../fixtures/auth-fixtures';
import { BooksPage } from '../pages/BooksPage';
import { DeliveryReceiptsPage } from '../pages/DeliveryReceiptsPage';
import { SalesInvoicesPage } from '../pages/SalesInvoicesPage';
import { ReservationsPage } from '../pages/ReservationsPage';
import { EvaluationFormsPage } from '../pages/EvaluationFormsPage';
import { ImportExportPage } from '../pages/ImportExportPage';
import { ProfilePage } from '../pages/ProfilePage';
import { LoginPage } from '../pages/LoginPage';

test.describe('Form Validation Tests', () => {
  test.describe('Book Form Validation', () => {
    let booksPage: BooksPage;

    test.beforeEach(async ({ adminPage }) => {
      booksPage = new BooksPage(adminPage);
      await booksPage.goto();
    });

    test('should validate required fields', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.saveButton.click();
      await booksPage.expectError('required');
    });

    test('should validate ISBN format', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.isbnField.fill('invalid-isbn');
      await booksPage.titleField.fill('Test Book');
      await booksPage.authorField.fill('Author');
      await booksPage.publisherField.fill('Publisher');
      await booksPage.categoryField.fill('Fiction');
      await booksPage.priceField.fill('29.99');
      await booksPage.costField.fill('15.00');
      await booksPage.stockField.fill('10');
      await booksPage.minStockField.fill('5');
      await booksPage.locationField.fill('A1');

      await booksPage.saveButton.click();
      await booksPage.expectError('ISBN');
    });

    test('should validate ISBN length (13 digits)', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.isbnField.fill('123456789012'); // 12 digits
      // Fill other required fields
      await booksPage.titleField.fill('Test Book');
      await booksPage.authorField.fill('Author');
      await booksPage.publisherField.fill('Publisher');
      await booksPage.categoryField.fill('Fiction');
      await booksPage.priceField.fill('29.99');
      await booksPage.costField.fill('15.00');
      await booksPage.stockField.fill('10');
      await booksPage.minStockField.fill('5');
      await booksPage.locationField.fill('A1');

      await booksPage.saveButton.click();
      await booksPage.expectError('ISBN');
    });

    test('should validate price is positive number', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.isbnField.fill('9780134685991');
      await booksPage.titleField.fill('Test Book');
      await booksPage.authorField.fill('Author');
      await booksPage.publisherField.fill('Publisher');
      await booksPage.categoryField.fill('Fiction');
      await booksPage.priceField.fill('-10');
      await booksPage.costField.fill('15.00');
      await booksPage.stockField.fill('10');
      await booksPage.minStockField.fill('5');
      await booksPage.locationField.fill('A1');

      await booksPage.saveButton.click();
      await booksPage.expectError('price');
    });

    test('should validate cost is positive number', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.isbnField.fill('9780134685991');
      await booksPage.titleField.fill('Test Book');
      await booksPage.authorField.fill('Author');
      await booksPage.publisherField.fill('Publisher');
      await booksPage.categoryField.fill('Fiction');
      await booksPage.priceField.fill('29.99');
      await booksPage.costField.fill('-5');
      await booksPage.stockField.fill('10');
      await booksPage.minStockField.fill('5');
      await booksPage.locationField.fill('A1');

      await booksPage.saveButton.click();
      await booksPage.expectError('cost');
    });

    test('should validate stock is non-negative integer', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.isbnField.fill('9780134685991');
      await booksPage.titleField.fill('Test Book');
      await booksPage.authorField.fill('Author');
      await booksPage.publisherField.fill('Publisher');
      await booksPage.categoryField.fill('Fiction');
      await booksPage.priceField.fill('29.99');
      await booksPage.costField.fill('15.00');
      await booksPage.stockField.fill('-1');
      await booksPage.minStockField.fill('5');
      await booksPage.locationField.fill('A1');

      await booksPage.saveButton.click();
      await booksPage.expectError('stock');
    });

    test('should validate minStock <= stock', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.isbnField.fill('9780134685991');
      await booksPage.titleField.fill('Test Book');
      await booksPage.authorField.fill('Author');
      await booksPage.publisherField.fill('Publisher');
      await booksPage.categoryField.fill('Fiction');
      await booksPage.priceField.fill('29.99');
      await booksPage.costField.fill('15.00');
      await booksPage.stockField.fill('5');
      await booksPage.minStockField.fill('10'); // minStock > stock
      await booksPage.locationField.fill('A1');

      await booksPage.saveButton.click();
      await booksPage.expectError('minimum stock');
    });

    test('should accept valid book data', async ({ adminPage }) => {
      const isbn = `978${Date.now().toString().slice(-10)}`;

      await booksPage.createBook({
        title: 'Valid Book',
        author: 'Valid Author',
        isbn: isbn,
        publisher: 'Valid Publisher',
        category: 'Fiction',
        price: 29.99,
        cost: 15.00,
        stock: 100,
        minStock: 10,
        location: 'A1',
      });

      await booksPage.expectSuccess();
    });
  });

  test.describe('Delivery Receipt Form Validation', () => {
    let deliveryPage: DeliveryReceiptsPage;

    test.beforeEach(async ({ adminPage }) => {
      deliveryPage = new DeliveryReceiptsPage(adminPage);
      await deliveryPage.goto();
    });

    test('should validate required fields', async ({ adminPage }) => {
      await deliveryPage.createButton.click();
      await expect(deliveryPage.modal).toBeVisible({ timeout: 5000 });

      await deliveryPage.saveButton.click();
      await deliveryPage.expectError('required');
    });

    test('should validate supplier selection', async ({ adminPage }) => {
      await deliveryPage.createButton.click();
      await expect(deliveryPage.modal).toBeVisible({ timeout: 5000 });

      // Don't select supplier
      await deliveryPage.saveButton.click();
      await deliveryPage.expectError('supplier');
    });

    test('should validate item quantity', async ({ adminPage }) => {
      await deliveryPage.createButton.click();
      await expect(deliveryPage.modal).toBeVisible({ timeout: 5000 });

      await deliveryPage.supplierField.selectOption({ label: 'Test Supplier' });
      // Add item with invalid qty
      await deliveryPage.saveButton.click();
      await deliveryPage.expectError('quantity');
    });
  });

  test.describe('Sales Invoice Form Validation', () => {
    let salesPage: SalesInvoicesPage;

    test.beforeEach(async ({ adminPage }) => {
      salesPage = new SalesInvoicesPage(adminPage);
      await salesPage.goto();
    });

    test('should validate required fields', async ({ adminPage }) => {
      await salesPage.createButton.click();
      await expect(salesPage.modal).toBeVisible({ timeout: 5000 });

      await salesPage.saveButton.click();
      await salesPage.expectError('required');
    });

    test('should validate customer selection', async ({ adminPage }) => {
      await salesPage.createButton.click();
      await expect(salesPage.modal).toBeVisible({ timeout: 5000 });

      await salesPage.saveButton.click();
      await salesPage.expectError('customer');
    });

    test('should validate item price and quantity', async ({ adminPage }) => {
      await salesPage.createButton.click();
      await expect(salesPage.modal).toBeVisible({ timeout: 5000 });

      await salesPage.customerField.selectOption({ label: 'Test Customer' });
      await salesPage.saveButton.click();
      await salesPage.expectError('price');
    });
  });

  test.describe('Reservation Form Validation', () => {
    let reservationsPage: ReservationsPage;

    test.beforeEach(async ({ adminPage }) => {
      reservationsPage = new ReservationsPage(adminPage);
      await reservationsPage.goto();
    });

    test('should validate required fields', async ({ adminPage }) => {
      await reservationsPage.createButton.click();
      await expect(reservationsPage.modal).toBeVisible({ timeout: 5000 });

      await reservationsPage.saveButton.click();
      await reservationsPage.expectError('required');
    });

    test('should validate customer selection', async ({ adminPage }) => {
      await reservationsPage.createButton.click();
      await expect(reservationsPage.modal).toBeVisible({ timeout: 5000 });

      await reservationsPage.saveButton.click();
      await reservationsPage.expectError('customer');
    });

    test('should validate ISBN', async ({ adminPage }) => {
      await reservationsPage.createButton.click();
      await expect(reservationsPage.modal).toBeVisible({ timeout: 5000 });

      await reservationsPage.customerField.selectOption({ label: 'Test Customer' });
      await reservationsPage.isbnField.fill('invalid');
      await reservationsPage.saveButton.click();
      await reservationsPage.expectError('ISBN');
    });

    test('should validate quantity > 0', async ({ adminPage }) => {
      await reservationsPage.createButton.click();
      await expect(reservationsPage.modal).toBeVisible({ timeout: 5000 });

      await reservationsPage.customerField.selectOption({ label: 'Test Customer' });
      await reservationsPage.isbnField.fill('9780134685991');
      await reservationsPage.qtyField.fill('0');
      await reservationsPage.saveButton.click();
      await reservationsPage.expectError('quantity');
    });
  });

  test.describe('Evaluation Form Validation', () => {
    let evalPage: EvaluationFormsPage;

    test.beforeEach(async ({ adminPage }) => {
      evalPage = new EvaluationFormsPage(adminPage);
      await evalPage.goto();
    });

    test('should validate required fields', async ({ adminPage }) => {
      await evalPage.createButton.click();
      await expect(evalPage.modal).toBeVisible({ timeout: 5000 });

      await evalPage.saveButton.click();
      await evalPage.expectError('required');
    });

    test('should validate executive selection', async ({ adminPage }) => {
      await evalPage.createButton.click();
      await expect(evalPage.modal).toBeVisible({ timeout: 5000 });

      await evalPage.saveButton.click();
      await evalPage.expectError('executive');
    });

    test('should validate date range', async ({ adminPage }) => {
      await evalPage.createButton.click();
      await expect(evalPage.modal).toBeVisible({ timeout: 5000 });

      await evalPage.executiveField.selectOption({ label: 'Test Executive' });
      await evalPage.periodStartField.fill('2024-01-31');
      await evalPage.periodEndField.fill('2024-01-01'); // End before start
      await evalPage.saveButton.click();
      await evalPage.expectError('date');
    });

    test('should validate numeric fields', async ({ adminPage }) => {
      await evalPage.createButton.click();
      await expect(evalPage.modal).toBeVisible({ timeout: 5000 });

      await evalPage.executiveField.selectOption({ label: 'Test Executive' });
      await evalPage.periodStartField.fill('2024-01-01');
      await evalPage.periodEndField.fill('2024-01-31');
      await evalPage.visitsField.fill('-1');
      await evalPage.saveButton.click();
      await evalPage.expectError('visits');
    });
  });

  test.describe('Import/Export Form Validation', () => {
    let importExportPage: ImportExportPage;

    test.beforeEach(async ({ adminPage }) => {
      importExportPage = new ImportExportPage(adminPage);
      await importExportPage.goto();
    });

    test('should validate file selection for import', async ({ adminPage }) => {
      await importExportPage.clickImportTab();

      await importExportPage.importButton.click();
      await importExportPage.expectError('file');
    });

    test('should validate file type for import', async ({ adminPage }) => {
      await importExportPage.clickImportTab();
      await importExportPage.importTypeSelect.selectOption('books');

      // Try to upload invalid file type
      // This would require a test file
    });

    test('should validate export type selection', async ({ adminPage }) => {
      await importExportPage.clickExportTab();

      // Don't select export type
      await importExportPage.exportButton.click();
      await importExportPage.expectError('export type');
    });
  });

  test.describe('Profile Form Validation', () => {
    let profilePage: ProfilePage;

    test.beforeEach(async ({ staffPage }) => {
      profilePage = new ProfilePage(staffPage);
      await profilePage.goto();
    });

    test('should validate email format', async ({ staffPage }) => {
      await profilePage.emailField.fill('invalid-email');
      await profilePage.saveButton.click();
      await profilePage.expectError('email');
    });

    test('should validate password strength on change', async ({ staffPage }) => {
      await profilePage.currentPasswordField.fill('CurrentPass123!');
      await profilePage.newPasswordField.fill('weak');
      await profilePage.confirmPasswordField.fill('weak');
      await profilePage.saveButton.click();
      await profilePage.expectError('password');
    });

    test('should validate password confirmation match', async ({ staffPage }) => {
      await profilePage.currentPasswordField.fill('CurrentPass123!');
      await profilePage.newPasswordField.fill('NewPass123!');
      await profilePage.confirmPasswordField.fill('DifferentPass123!');
      await profilePage.saveButton.click();
      await profilePage.expectError('match');
    });

    test('should validate current password', async ({ staffPage }) => {
      await profilePage.currentPasswordField.fill('WrongPassword');
      await profilePage.newPasswordField.fill('NewPass123!');
      await profilePage.confirmPasswordField.fill('NewPass123!');
      await profilePage.saveButton.click();
      await profilePage.expectError('current');
    });
  });

  test.describe('Login Form Validation', () => {
    let loginPage: LoginPage;

    test.beforeEach(async ({ page }) => {
      loginPage = new LoginPage(page);
      await loginPage.goto();
    });

    test('should validate email required', async ({ page }) => {
      await loginPage.login('', 'password');
      await loginPage.expectError('email');
    });

    test('should validate password required', async ({ page }) => {
      await loginPage.login('test@test.com', '');
      await loginPage.expectError('password');
    });

    test('should validate email format', async ({ page }) => {
      await loginPage.login('invalid-email', 'password');
      await loginPage.expectError('email');
    });
  });

  test.describe('Form Accessibility', () => {
    let booksPage: BooksPage;

    test.beforeEach(async ({ adminPage }) => {
      booksPage = new BooksPage(adminPage);
      await booksPage.goto();
    });

    test('should have proper labels for all inputs', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      const inputs = adminPage.locator('input, select, textarea');
      const count = await inputs.count();

      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledby = await input.getAttribute('aria-labelledby');

        // Input should have either id with label, aria-label, or aria-labelledby
        const hasLabel = id ? await adminPage.locator(`label[for="${id}"]`).count() > 0 : false;
        expect(hasLabel || ariaLabel || ariaLabelledby).toBeTruthy();
      }
    });

    test('should have proper error messages', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.saveButton.click();

      // Error messages should be associated with inputs
      const errors = adminPage.locator('[role="alert"], .error-message, .text-red-600');
      const errorCount = await errors.count();
      expect(errorCount).toBeGreaterThan(0);
    });

    test('should support keyboard navigation', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      // Tab through fields
      await adminPage.keyboard.press('Tab');
      const focused = adminPage.locator(':focus');
      await expect(focused).toBeVisible({ timeout: 5000 });

      // Should be able to reach all fields
    });

    test('should announce errors to screen readers', async ({ adminPage }) => {
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await booksPage.saveButton.click();

      // Errors should have role="alert" or aria-live
      const alerts = adminPage.locator('[role="alert"], [aria-live="polite"], [aria-live="assertive"]');
      // At least some errors should be announced
    });
  });
});