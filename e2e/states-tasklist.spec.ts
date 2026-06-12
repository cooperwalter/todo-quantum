import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

const BREAKPOINTS: [string, number][] = [
  ['mobile', 375],
  ['tablet', 768],
  ['desktop', 1280],
];

function seedTasks(page: Page) {
  return page.addInitScript(() => {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const base = {
      status: 'open',
      dueTime: null,
      list: null,
      priority: null,
      recurrence: null,
      createdAt: '2026-06-01T08:00:00.000Z',
      completedAt: null,
    };
    window.localStorage.setItem(
      'todo-quantum.v1',
      JSON.stringify({
        schemaVersion: 1,
        tasks: [
          { ...base, id: 'seed-rollover', title: 'Overdue invoice', dueDate: fmt(yesterday), order: 1 },
          { ...base, id: 'seed-today', title: 'Send report', dueDate: fmt(today), dueTime: '15:00', list: 'work', priority: 1, order: 2 },
          { ...base, id: 'seed-anytime', title: 'Read design doc', dueDate: null, order: 3 },
        ],
      }),
    );
  });
}

const FREEZE =
  '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';

for (const [name, width] of BREAKPOINTS) {
  test(`task list with rollover + today + anytime and a selected row @ ${name}`, async ({ page }) => {
    await seedTasks(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('.task-row')).toHaveCount(3);
    await page.locator('.task-row', { hasText: 'Send report' }).locator('.task-row-list').click();
    await expect(page.locator('.task-row--selected')).toHaveCount(1);
    await page.addStyleTag({ content: FREEZE });
    await expect(page).toHaveScreenshot(`tasklist-selected-${name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}

test('rollover row shows the muted italic since annotation, never danger', async ({ page }) => {
  await seedTasks(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  const since = page.locator('.task-row-since');
  await expect(since).toHaveText(/— since /);
  const color = await since.evaluate((el) => getComputedStyle(el).color);
  const danger = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim(),
  );
  const toRgb = (hex: string) =>
    `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  expect(color).not.toBe(toRgb(danger));
});

test('empty list renders the italic empty state @ desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.empty-state')).toHaveText('Nothing on deck — type to capture.');
  await page.addStyleTag({ content: FREEZE });
  await expect(page).toHaveScreenshot('tasklist-empty-desktop.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
