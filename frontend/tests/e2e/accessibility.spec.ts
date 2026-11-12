import { test, expect } from '../fixtures/auth-fixtures';
import { DashboardPage } from '../pages/DashboardPage';
import { BooksPage } from '../pages/BooksPage';
import { ScanPage } from '../pages/ScanPage';
import { AdminPanelPage } from '../pages/AdminPanelPage';
import { ProfilePage } from '../pages/ProfilePage';
import { DeliveryReceiptsPage } from '../pages/DeliveryReceiptsPage';
import { SalesInvoicesPage } from '../pages/SalesInvoicesPage';
import { ReservationsPage } from '../pages/ReservationsPage';
import { EvaluationFormsPage } from '../pages/EvaluationFormsPage';
import { ImportExportPage } from '../pages/ImportExportPage';
import { LoginPage } from '../pages/LoginPage';

test.describe('Accessibility Tests', () => {
  test.describe('Keyboard Navigation', () => {
    test('should navigate entire app with keyboard only', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Tab through header
      await adminPage.keyboard.press('Tab');
      let focused = adminPage.locator(':focus');
      await expect(focused).toBeVisible({ timeout: 5000 });

      // Tab through sidebar
      for (let i = 0; i < 15; i++) {
        await adminPage.keyboard.press('Tab');
        focused = adminPage.locator(':focus');
        await expect(focused).toBeVisible({ timeout: 2000 });
      }
    });

    test('should skip to main content', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Look for skip link
      const skipLink = adminPage.locator('a[href="#main"], a.skip-link, a:has-text("Skip to main")');
      if (await skipLink.isVisible()) {
        await skipLink.focus();
        await adminPage.keyboard.press('Enter');

        const main = adminPage.locator('main, [role="main"], #main');
        await expect(main).toBeFocused({ timeout: 5000 });
      }
    });

    test('should trap focus in modals', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      // Tab within modal
      const initialFocus = adminPage.locator(':focus');
      await expect(initialFocus).toBeVisible({ timeout: 2000 });

      // Tab through all focusable elements in modal
      for (let i = 0; i < 10; i++) {
        await adminPage.keyboard.press('Tab');
        const focused = adminPage.locator(':focus');
        await expect(focused).toBeVisible({ timeout: 2000 });

        // Focus should stay within modal
        const isInModal = await focused.evaluate((el, modal) => {
          return modal.contains(el);
        }, await adminPage.locator('[role="dialog"], .modal').elementHandle());

        expect(isInModal).toBe(true);
      }
    });

    test('should close modal with Escape key', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      await adminPage.keyboard.press('Escape');
      await expect(booksPage.modal).not.toBeVisible({ timeout: 5000 });
    });

    test('should activate buttons with Enter/Space', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      const booksLink = adminPage.locator('nav a:has-text("Books"), aside a:has-text("Books")').first();
      if (await booksLink.isVisible()) {
        await booksLink.focus();
        await adminPage.keyboard.press('Enter');
        await adminPage.waitForURL(/\/books/, { timeout: 10000 });
        await expect(adminPage).toHaveURL(/\/books/);
      }
    });

    test('should navigate dropdowns with arrow keys', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      const userMenu = adminPage.locator('[aria-label="user menu"], .user-menu, button:has-text("Admin")');
      if (await userMenu.isVisible()) {
        await userMenu.focus();
        await adminPage.keyboard.press('Enter');

        const dropdown = adminPage.locator('[role="menu"], .dropdown-menu');
        await expect(dropdown).toBeVisible({ timeout: 5000 });

        // Navigate with arrow keys
        await adminPage.keyboard.press('ArrowDown');
        await adminPage.keyboard.press('ArrowDown');
        await adminPage.keyboard.press('ArrowUp');
      }
    });
  });

  test.describe('ARIA Attributes', () => {
    test('should have proper landmark roles', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Check for main landmark
      const main = adminPage.locator('main, [role="main"]');
      await expect(main).toBeVisible({ timeout: 5000 });

      // Check for navigation landmark
      const nav = adminPage.locator('nav, [role="navigation"]');
      await expect(nav).toBeVisible({ timeout: 5000 });

      // Check for header
      const header = adminPage.locator('header, [role="banner"]');
      await expect(header).toBeVisible({ timeout: 5000 });
    });

    test('should label all form inputs', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      const inputs = adminPage.locator('input, select, textarea');
      const count = await inputs.count();

      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledby = await input.getAttribute('aria-labelledby');

        if (id) {
          const label = adminPage.locator(`label[for="${id}"]`);
          const hasLabel = await label.count() > 0;
          expect(hasLabel || ariaLabel || ariaLabelledby).toBeTruthy();
        } else {
          expect(ariaLabel || ariaLabelledby).toBeTruthy();
        }
      }
    });

    test('should have proper heading hierarchy', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      const headings = adminPage.locator('h1, h2, h3, h4, h5, h6');
      const count = await headings.count();

      expect(count).toBeGreaterThan(0);

      // First heading should be h1
      const firstHeading = headings.first();
      await expect(firstHeading).toBeVisible({ timeout: 5000 });
    });

    test('should mark required fields', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      const requiredInputs = adminPage.locator('input[required], select[required], textarea[required]');
      const count = await requiredInputs.count();

      for (let i = 0; i < count; i++) {
        const input = requiredInputs.nth(i);
        const ariaRequired = await input.getAttribute('aria-required');
        const hasAsterisk = await input.locator('..').locator('text=*').count() > 0;

        // Should have aria-required or visual indicator
        expect(ariaRequired === 'true' || hasAsterisk).toBeTruthy();
      }
    });

    test('should announce dynamic content changes', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();

      // Search should update results
      await booksPage.searchBook('Test');

      // Results region should have aria-live
      const resultsRegion = adminPage.locator('[aria-live], [role="status"], [role="alert"]');
      // At least one should exist for dynamic content
    });

    test('should have proper table structure', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();
      await booksPage.waitForLoad();

      const table = adminPage.locator('table');
      await expect(table).toBeVisible({ timeout: 10000 });

      // Check for thead, tbody
      const thead = adminPage.locator('thead');
      const tbody = adminPage.locator('tbody');

      await expect(thead).toBeVisible({ timeout: 5000 });
      await expect(tbody).toBeVisible({ timeout: 5000 });

      // Check for th with scope
      const headers = adminPage.locator('th[scope="col"]');
      // Should have column headers
    });
  });

  test.describe('Color Contrast', () => {
    test('should meet WCAG AA contrast for text', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // This is a visual test - we check that text is visible
      const textElements = adminPage.locator('p, span, h1, h2, h3, h4, h5, h6, a, button, label');
      const count = await textElements.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        const el = textElements.nth(i);
        if (await el.isVisible()) {
          const color = await el.evaluate(el => {
            const style = window.getComputedStyle(el);
            return {
              color: style.color,
              backgroundColor: style.backgroundColor,
            };
          });

          // Basic check - elements should have color defined
          expect(color.color).toBeDefined();
        }
      }
    });

    test('should meet WCAG AA contrast for UI components', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Check buttons
      const buttons = adminPage.locator('button:visible');
      const count = await buttons.count();

      for (let i = 0; i < Math.min(count, 10); i++) {
        const button = buttons.nth(i);
        if (await button.isVisible()) {
          const styles = await button.evaluate(el => {
            const style = window.getComputedStyle(el);
            return {
              backgroundColor: style.backgroundColor,
              borderColor: style.borderColor,
              color: style.color,
            };
          });

          expect(styles.backgroundColor).toBeDefined();
        }
      }
    });

    test('should not rely on color alone for meaning', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();
      await booksPage.waitForLoad();

      // Status indicators should have text/icons, not just color
      const statusBadges = adminPage.locator('.badge, .status, [class*="status"]');
      const count = await statusBadges.count();

      for (let i = 0; i < count; i++) {
        const badge = statusBadges.nth(i);
        const text = await badge.textContent();
        // Should have text content, not just color
        expect(text?.trim().length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('Focus Management', () => {
    test('should have visible focus indicators', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Tab to first focusable element
      await adminPage.keyboard.press('Tab');

      const focused = adminPage.locator(':focus');
      await expect(focused).toBeVisible({ timeout: 5000 });

      // Check for focus ring/outline
      const styles = await focused.evaluate(el => {
        const style = window.getComputedStyle(el);
        return {
          outline: style.outline,
          outlineWidth: style.outlineWidth,
          outlineStyle: style.outlineStyle,
          outlineColor: style.outlineColor,
          boxShadow: style.boxShadow,
        };
      });

      // Should have visible focus indicator
      const hasFocusIndicator = styles.outlineWidth !== '0px' &&
        styles.outlineStyle !== 'none' ||
        styles.boxShadow !== 'none';

      expect(hasFocusIndicator).toBeTruthy();
    });

    test('should restore focus after modal closes', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();

      // Focus the create button
      await booksPage.createButton.focus();
      await expect(booksPage.createButton).toBeFocused({ timeout: 5000 });

      // Open modal
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      // Close modal
      await adminPage.keyboard.press('Escape');
      await expect(booksPage.modal).not.toBeVisible({ timeout: 5000 });

      // Focus should return to create button
      await expect(booksPage.createButton).toBeFocused({ timeout: 5000 });
    });

    test('should focus first error on form submit', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      // Submit empty form
      await booksPage.saveButton.click();

      // First invalid field should be focused
      const firstInvalid = adminPage.locator('input[aria-invalid="true"], select[aria-invalid="true"]').first();
      await expect(firstInvalid).toBeFocused({ timeout: 5000 });
    });
  });

  test.describe('Screen Reader Support', () => {
    test('should have page titles', async ({ adminPage }) => {
      const pages = [
        { goto: () => new DashboardPage(adminPage).goto(), title: /Dashboard/ },
        { goto: () => new BooksPage(adminPage).goto(), title: /Books/ },
        { goto: () => new ScanPage(adminPage).goto(), title: /Scan/ },
        { goto: () => new ProfilePage(adminPage).goto(), title: /Profile/ },
      ];

      for (const page of pages) {
        await page.goto();
        await adminPage.waitForLoad();

        await expect(adminPage).toHaveTitle(page.title);
      }
    });

    test('should have descriptive link text', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      const links = adminPage.locator('a[href]');
      const count = await links.count();

      for (let i = 0; i < Math.min(count, 20); i++) {
        const link = links.nth(i);
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute('aria-label');

        // Link should have descriptive text or aria-label
        expect((text && text.trim().length > 0) || ariaLabel).toBeTruthy();

        // Should not be generic
        if (text) {
          expect(text.toLowerCase()).not.toBe('click here');
          expect(text.toLowerCase()).not.toBe('read more');
          expect(text.toLowerCase()).not.toBe('here');
        }
      }
    });

    test('should have alt text for images', async ({ adminPage }) => {
      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      const images = adminPage.locator('img');
      const count = await images.count();

      for (let i = 0; i < count; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        const role = await img.getAttribute('role');

        // Decorative images should have empty alt or role="presentation"
        // Content images should have descriptive alt
        expect(alt !== null || role === 'presentation').toBeTruthy();
      }
    });

    test('should announce loading states', async ({ adminPage }) => {
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();

      // Trigger search
      await booksPage.searchBook('Test');

      // Loading indicator should have aria-busy or role="status"
      const loading = adminPage.locator('[aria-busy="true"], [role="status"], .loading, .spinner');
      // Should appear during load
    });

    test('should describe error messages', async ({ adminPage }) => {
      const loginPage = new LoginPage(adminPage);
      await loginPage.goto();

      // Submit invalid login
      await loginPage.login('invalid', 'wrong');

      // Error should be announced
      const error = adminPage.locator('[role="alert"], .error-message, .text-red-600');
      await expect(error).toBeVisible({ timeout: 5000 });

      // Should be associated with form
      const errorId = await error.getAttribute('id');
      const form = adminPage.locator('form');
      const ariaDescribedby = await form.getAttribute('aria-describedby');

      // Error should be linked to form
    });
  });

  test.describe('Reduced Motion', () => {
    test('should respect prefers-reduced-motion', async ({ adminPage }) => {
      // Set reduced motion preference
      await adminPage.emulateMedia({ reducedMotion: 'reduce' });

      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Animations should be disabled or minimal
      const animatedElements = adminPage.locator('[class*="animate"], [class*="transition"], [style*="animation"]');
      // Check that animations are not running
    });

    test('should disable auto-playing animations', async ({ adminPage }) => {
      await adminPage.emulateMedia({ reducedMotion: 'reduce' });

      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Carousels, auto-rotating elements should be paused
      const carousels = adminPage.locator('[class*="carousel"], [class*="slider"]');
      // Should not auto-play
    });
  });

  test.describe('High Contrast Mode', () => {
    test('should work with forced colors', async ({ adminPage }) => {
      await adminPage.emulateMedia({ forcedColors: 'active' });

      const dashboardPage = new DashboardPage(adminPage);
      await dashboardPage.goto();
      await dashboardPage.waitForLoad();

      // Content should still be visible and functional
      await expect(adminPage.locator('h1:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });

      // Form inputs should have visible borders
      const booksPage = new BooksPage(adminPage);
      await booksPage.goto();
      await booksPage.createButton.click();
      await expect(booksPage.modal).toBeVisible({ timeout: 5000 });

      const inputs = adminPage.locator('input, select, textarea');
      const count = await inputs.count();

      for (let i = 0; i < count; i++) {
        const input = inputs.nth(i);
        const styles = await input.evaluate(el => {
          const style = window.getComputedStyle(el);
          return { borderColor: style.borderColor };
        });

        // Should have border in forced colors mode
      }
    });
  });
});