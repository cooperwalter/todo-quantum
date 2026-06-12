import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

function seedOneTask(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem(
      'todo-quantum.v1',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          {
            id: 'seed-1',
            title: 'Send report',
            status: 'open',
            dueDate: null,
            dueTime: null,
            list: null,
            priority: null,
            recurrence: null,
            createdAt: '2026-06-01T08:00:00.000Z',
            completedAt: null,
            order: 1,
          },
        ],
      }),
    );
  });
}

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

test('? from the list opens the cheatsheet dialog and Esc closes it restoring focus', async ({ page }) => {
  await seedOneTask(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.task-row')).toBeFocused();
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.task-row')).toBeFocused();
});

test('the >help command opens the cheatsheet dialog', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('.command-bar-input').fill('>help');
  await page.locator('.command-bar-input').press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('focus stays trapped inside the open cheatsheet while tabbing', async ({ page }) => {
  await seedOneTask(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog !== null && dialog.contains(document.activeElement);
    });
    expect(inside).toBe(true);
  }
});

for (const [name, width] of BREAKPOINTS) {
  test(`cheatsheet open over the scrim @ ${name}`, async ({ page }) => {
    await seedOneTask(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot(`cheatsheet-open-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}
