import { Page, Locator, expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly statsCards: Locator;
  readonly statsGrid: Locator;
  readonly quickActions: Locator;
  readonly recentActivity: Locator;
  readonly sidebar: Locator;
  readonly mobileMenuButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.statsCards = page.locator('[class*="stat"], [class*="card"], .grid > div').first();
    this.statsGrid = page.locator('.grid, [class*="stats"], [class*="dashboard"]');
    this.quickActions = page.locator('text=Quick Actions, [class*="quick-action"], button:has-text("Add"), button:has-text("Create")').first();
    this.recentActivity = page.locator('text=Recent Activity, text=Activity, [class*="activity"]').first();
    this.sidebar = page.locator('aside[class*="w-64"], aside[class*="w-16"], nav, [role="navigation"]');
    this.mobileMenuButton = page.locator('button[aria-label="Open menu"], button[aria-label*="menu" i], .hamburger, .mobile-menu-toggle');
  }

  async goto() {
    await this.page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad();
  }

  async waitForLoad() {
    // Wait for dashboard to load - check for any heading or stats
    await expect(this.page.locator('h1, h2, [class*="stat"], [class*="card"], .grid > div').first()).toBeVisible({ timeout: 15000 });
  }

  async getStats() {
    const cards = await this.statsCards.all();
    const stats: Record<string, string> = {};

    for (const card of cards) {
      const label = await card.locator('text=/Total Books|Total Quantity|Low Stock|Out of Stock|In Stock|Today/i').first().textContent();
      const value = await card.locator('text=/\\d+/').first().textContent();
      if (label && value) {
        stats[label.trim()] = value.trim();
      }
    }

    return stats;
  }

  async clickQuickAction(actionText: string) {
    await this.page.click(`button:has-text("${actionText}")`);
  }

  async openMobileMenu() {
    await this.mobileMenuButton.click();
  }

  async closeMobileMenu() {
    // Click overlay or press escape
    await this.page.keyboard.press('Escape');
  }
}