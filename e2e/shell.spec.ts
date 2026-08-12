import { test, expect, FIXED_NOW } from './fixtures';
import type { Page } from '@playwright/test';

function expectedMastheadDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(FIXED_NOW);
}

function hexToRgb(hex: string): string {
  const clean = hex.trim().replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// A first visit for a username the server has never seen answers 404 by design
// ("no remote list yet"), and Chromium logs every 404 as a console error. That
// one endpoint is filtered by URL rather than by message text, so an unexpected
// 404 anywhere else (a missing font, a broken asset) still fails the test.
const REMOTE_DATA_ENDPOINT = /\/api\/users\/[^/]+\/data$/;

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (REMOTE_DATA_ENDPOINT.test(msg.location().url)) return;
    errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('masthead shows today\'s date', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.masthead-date')).toHaveText(expectedMastheadDate());
});

test('all four view tabs render', async ({ page }) => {
  await page.goto('/');
  const tabs = page.locator('.view-tab');
  await expect(tabs).toHaveCount(4);
  for (const name of ['Today', 'Upcoming', 'All', 'Done']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
});

test('clicking each tab switches the visible placeholder view', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.empty-state-copy')).toHaveText('Nothing on deck — type to capture.');
  await page.getByRole('button', { name: 'Upcoming' }).click();
  await expect(page.locator('.empty-state-copy')).toHaveText('Nothing ahead — type to capture.');
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.empty-state-copy')).toHaveText('Nothing here — type to capture.');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.empty-state-copy')).toHaveText('Nothing done yet — finish something today.');
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.locator('.empty-state-copy')).toHaveText('Nothing on deck — type to capture.');
});

test('current tab carries the crimson underline', async ({ page }) => {
  await page.goto('/');
  await page.emulateMedia({ colorScheme: 'light' });
  const danger = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-danger'),
  );
  const current = page.locator('.view-tab[aria-current="page"]');
  await expect(current).toHaveText(/Today/i);
  await expect(current).toHaveCSS('border-bottom-color', hexToRgb(danger));
  await page.getByRole('button', { name: 'Upcoming' }).click();
  const newCurrent = page.locator('.view-tab[aria-current="page"]');
  await expect(newCurrent).toHaveText(/Upcoming/i);
  await expect(newCurrent).toHaveCSS('border-bottom-color', hexToRgb(danger));
});

test('page loads with no console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Done' }).click();
  expect(errors).toEqual([]);
});
