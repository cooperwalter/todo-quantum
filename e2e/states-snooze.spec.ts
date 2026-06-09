import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

function seedTask(page: Page) {
  return page.addInitScript(() => {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    window.localStorage.setItem(
      'todo-quantum.v1',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          {
            id: 's1', title: 'Overdue chore', status: 'open', dueDate: fmt(yesterday),
            dueTime: null, list: null, priority: null, recurrence: null,
            createdAt: '2026-06-01T08:00:00.000Z', completedAt: null, order: 1,
          },
        ],
      }),
    );
  });
}

test('overflow menu open state @ desktop', async ({ page }) => {
  await seedTask(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /task options/i }).click();
  await expect(page.getByRole('menuitem', { name: 'Tomorrow' })).toBeVisible();
  await page.addStyleTag({ content: FREEZE });
  await expect(page).toHaveScreenshot('snooze-menu-open-desktop.png', {
    fullPage: true,
    animations: 'disabled',
  });
});

test('snoozing from the menu moves the task out of rollover and toasts the new date', async ({ page }) => {
  await seedTask(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.task-section-label').first()).toHaveText('Rollover');
  await page.getByRole('button', { name: /task options/i }).click();
  await page.getByRole('menuitem', { name: 'Tomorrow' }).click();
  await expect(page.locator('.task-row')).toHaveCount(0);
  await expect(page.locator('.toast-message')).toHaveText(/^Snoozed to /);
});

test('pressing 1 on a selected row snoozes to tomorrow', async ({ page }) => {
  await seedTask(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('1');
  await expect(page.locator('.task-row')).toHaveCount(0);
  await expect(page.locator('.toast-message')).toHaveText(/^Snoozed to /);
});
